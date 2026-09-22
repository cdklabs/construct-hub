# The npm sync protocol: what it does and does not guarantee

This document describes the protocol ConstructHub's `NpmJs` package source uses to discover new package versions,
the guarantees npm gives (and explicitly does not give) for that protocol,
and how ConstructHub compensates for each gap.
Claims cite public npm statements where they exist;
anything marked *(our observation)* we established ourselves through incident investigation.

## The protocol

Syncing from npm uses two endpoints:

1. **The changes feed** at `https://replicate.npmjs.com/registry/_changes`.
   A paginated stream of change entries, each `{ seq, id, changes: [{ rev }] }`, read with `?since=<seq>&limit=<n>`.
   A consumer pages forward by passing the previous response's `last_seq` as the next `since`.
2. **The registry** at `https://registry.npmjs.org/<package>`.
   Change entries carry no package content,
   so a consumer fetches the full metadata document (the "packument") from the registry,
   and derives new versions from its `time` map.

Since May 2025 the feed is no longer a real CouchDB.
npm replaced it with a purpose-built service (the root endpoint reports `engine: "npm-replicate"`)
that keeps the CouchDB API shape but supports only a subset of it
([migration guide][152515], [deprecation notice][changelog]).
Several of the non-guarantees below date from this migration.

## What npm guarantees

- **Pagination by sequence number.**
  `_changes?since=<seq>&limit=<n>` returns change entries with `seq > since` in ascending order,
  plus a `last_seq` to continue from.
  `limit` defaults to 1,000 and caps at 10,000 ([migration guide][152515]).
- **A head-of-feed pointer.**
  The root endpoint (`/`) reports the current `update_seq`;
  npm recommends it as the starting point for a new consumer ([npm engineering response][152515-updateseq]).
- **One entry per package.**
  A package has at most one entry in the feed:
  a new change replaces the package's previous entry, at a new sequence number.
  npm confirmed this is intended ([npm: "That is indeed normal feed behavior"][152515-late]).
- **Metadata lives in the registry, not the feed.**
  `include_docs` is not supported;
  npm's documented guidance is to fetch packuments from `registry.npmjs.org` separately ([migration guide][152515]).

That is the entire public contract.
Notably absent: any statement about *when* a change becomes visible in the feed,
or that it becomes visible at all.

## What npm does not guarantee

Each heading below states a property a consumer might reasonably expect, but that npm does not guarantee.
For ease of use, each gap also gets a name;
the code and the operator runbook reference the same names.

### Changes become visible in order

Change entries can appear in the feed *behind* a previously returned `last_seq`;
we name this gap *late insertion*.
A consumer that reads strictly forward will never see such an entry.
Community measurement found ~4 late-inserted entries per 1,024-entry window over two hours;
npm's response was that entries appearing behind `last_seq` is expected
([report][152515-late-report], [npm confirmation][152515-late]).

*(our observation)* The delay can be far larger than the minutes suggested in that thread.
On 2026-09-21 we read past a probe package's sequence range within ~3 minutes of its entry's sequence number
being assigned, and the entry was not served;
a manual re-read of the same range two hours later returned it.
Five consecutive versions of the package were missed this way over ~15 hours.
See the [appendix](#appendix-a-late-insertion-reconstructed) for a reconstructed timeline.

### The registry is up-to-date with the changes feed

The registry can serve a packument revision *older* than the revision the feed announced for the same package,
sometimes for extended periods;
we name this gap *laggy packuments*.
The feed and the registry are separate systems and are not consistent with each other
([community description][152515-stale], [metadata out of sync][128412]).

A consumer can detect this:
the packument carries no sequence number,
but the feed entry announces the revision(s) it covers and the packument carries its current revision (`_rev`).
Comparing the numeric prefix of the two tells a consumer whether the registry has caught up
with the change it is processing.

*(our observation)* This is not rare.
E.g. on 2026-09-21 the follower logged ~66,000 revision-mismatch retries across unrelated packages in a single day.

### Every change becomes visible

Occasionally a change never becomes visible in the feed at any sequence number;
we name this gap *lost events*.
Because a package has at most one entry, there is nothing to find by re-reading the feed:
the package's only entry still describes its previous publish.
The change only surfaces when the package publishes again and a fresh entry replaces the old one.
This was reported for `patch-package@7.0.0` (missing for a month, recovered only by the next publish)
and for `zod-validation-error@1.5.0`;
deletions have also been observed not to propagate, in the thousands
([lost events][128412], [version skipped a revision][128412-lost], [missing deletions][128412-deletions]).

### Sequence numbers are dense

Sequence numbers are opaque cursors, not counters.
The sequence space has gaps,
and values have jumped by tens of millions within weeks during the 2025 migration ([seq jumps][152515-jumps]).
A consumer must not derive meaning from the distance between two sequence numbers.

### The feed head only moves forward

Change entries can disappear from the end of the feed,
in effect moving the head (`update_seq`) *backwards*;
we name this gap *head regression*.
During the 2025 migration the head regressed by ~20 million,
and previously returned entries above the new head no longer existed ([seq regression][152515-regression]).
The pre-migration feed also once froze its `update_seq` entirely for hours ([stuck update_seq][128412-stuck]).

## How ConstructHub compensates

The *NpmJs Follower* runs on a regular schedule and fetches packuments from the registry to identify new versions.
It does not track a single high-water mark:
it keeps a receipt for every change entry it has received,
and every run re-reads a trailing window of the feed,
processing any entry it has no receipt for.
Rolling checkpoints map times to feed positions, and derive the window's starting position.
On top of that baseline, each gap has a dedicated mitigation:

| Gap              | Mitigation                                                                                                                     | Detection                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Late insertion   | Every scan re-covers the trailing window; a periodic deep scan covers the full state retention                                | `LateChangeCount` / `LateChangeLag` metrics; `LateChangeLagHigh` alarm                       |
| Laggy packuments | Process every packument the registry serves immediately; record the announced revision and re-check it every run until it appears or ages out | `LaggyPackuments` / `LaggyPackumentsRecovered` / `LaggyPackumentGiveUps` metrics; `LaggyPackumentGiveUps` alarm |
| Lost events      | None possible; the missed versions self-heal on the package's next publish                                                     | Package canary (`Canary/SLA-Breached`) covers the probe package                              |
| Head regression  | The follower discards its position state and reseeds at the new head when the feed head drops below its newest checkpoint     | `LastSeq` metric                                                                             |

**The design idea behind all of this is that the feed data are just hints without real guarantees.**
The follower treats every change entry as "this package probably changed around here",
and keeps enough state (receipts, checkpoints, known versions) to re-derive correctness from re-reads.

## Appendix: a late insertion, reconstructed

The timeline below reconstructs the 2026-09-21 incident from log evidence and manual feed reads
*(our observation)*.
Times are UTC; "seq X" is the sequence number assigned to the probe package's change entry.

```text
time    consumer                              feed
─────   ───────────────────────────────────   ──────────────────────────────────────
15:09   package version is published          entry assigned seq X, NOT yet visible
15:12   reads past seq X, entry not served    entry still not visible
15:??                                         entry becomes visible at seq X, which
                                              is behind the consumer's position
17:10   manually re-reads the range at seq X  entry is served ("late insertion")
```

A consumer that never re-reads previously covered ranges has no way to notice that anything happened.

## References

- Operator runbook sections for the alarms named above: [operator-runbook.md](./operator-runbook.md)
- Follower implementation: `src/package-sources/npmjs/npm-js-follower.lambda.ts`
- Incident that motivated the windowed scan: internal reference V2376798198 *(our observation)*

[152515]: https://github.com/orgs/community/discussions/152515
[changelog]: https://github.blog/changelog/2025-02-27-changes-and-deprecation-notice-for-npm-replication-apis
[152515-updateseq]: https://github.com/orgs/community/discussions/152515#discussioncomment-12713712
[152515-late-report]: https://github.com/orgs/community/discussions/152515#discussioncomment-13561875
[152515-late]: https://github.com/orgs/community/discussions/152515#discussioncomment-13563633
[152515-stale]: https://github.com/orgs/community/discussions/152515#discussioncomment-15298851
[128412-lost]: https://github.com/orgs/community/discussions/128412#discussioncomment-7445623
[152515-jumps]: https://github.com/orgs/community/discussions/152515#discussioncomment-12731335
[152515-regression]: https://github.com/orgs/community/discussions/152515#discussioncomment-12754432
[128412]: https://github.com/orgs/community/discussions/128412
[128412-deletions]: https://github.com/orgs/community/discussions/128412#discussioncomment-6755605
[128412-stuck]: https://github.com/orgs/community/discussions/128412#discussioncomment-7653871
