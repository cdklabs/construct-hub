import {
  DEEP_SCAN_INTERVAL_MS,
  STATE_RETENTION_MS,
} from './constants.lambda-shared';

/**
 * A point-in-time record of a feed position the follower has fully read up
 * to: "at time `at`, a completed scan had received everything the feed served
 * up to sequence number `seq`".
 */
export interface Checkpoint {
  /**
   * Epoch milliseconds at which the checkpoint was taken.
   */
  readonly at: number;

  /**
   * The sequence number the completed scan had reached.
   */
  readonly seq: number;
}

/**
 * A package whose registry packument is behind the revision announced by the
 * `_changes` feed. The versions the registry did serve have been processed;
 * this expectation tracks the revision we are still waiting for.
 */
export interface LaggyPackument {
  /**
   * The package name.
   */
  readonly name: string;

  /**
   * The revision (sequential prefix) announced by the changes feed.
   */
  readonly expectedRev: number;

  /**
   * The sequence number of the change entry that announced the revision, if
   * known.
   */
  readonly seq?: number;

  /**
   * Epoch milliseconds at which the expectation was first recorded. Drives
   * the give-up policy.
   */
  readonly firstSeen: number;
}

/**
 * The persisted state of the *NpmJs Follower*, in a newline-delimited
 * plain-text format so it can be scanned cheaply (e.g. `grep '^s 131711133$'`)
 * and parsed without materializing a large JSON document. Each line is a
 * record identified by its first token:
 *
 * ```text
 * #chfollower/1                        <- header (format magic + version)
 * w <lastDeepScanAt>                   <- deep scan bookkeeping ("-" when unset)
 * c <at> <seq>                         <- checkpoint (repeated, ascending by time)
 * l <firstSeen> <expectedRev> <seq> <name>  <- laggy packument (repeated; seq is "-" when unknown)
 * s <seq>                              <- received sequence number (repeated, ascending)
 * ```
 *
 * The receipts are an exact set on purpose: any form of range encoding would
 * claim coverage of sequence numbers that were never observed, and a late
 * inserted change entry at such a position would be skipped - which is the
 * exact failure mode the receipts exist to catch.
 */
const STATE_FORMAT_HEADER = '#chfollower/1';

/**
 * Tracks which `_changes` feed entries (by sequence number) the follower has
 * already received, rolling time/seq checkpoints mapping times to feed
 * positions, and the set of laggy packuments awaiting a registry catch-up.
 *
 * The npm `_changes` feed does not guarantee that entries only ever become
 * visible above previously returned `last_seq` values. The receipt set
 * upgrades the follower's position tracking from "I have processed everything
 * up to X" to "here is exactly what I received up to X", enabling cheap
 * re-scans of a trailing window that only process entries with no receipt.
 */
export class FollowerState {
  public static fromText(text: string): FollowerState {
    const state = new FollowerState();
    const lines = text.split('\n');
    if (lines[0]?.trim() !== STATE_FORMAT_HEADER) {
      throw new Error(
        `Unexpected follower state header: ${JSON.stringify(lines[0])}`
      );
    }
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }
      const parts = line.split(' ');
      switch (parts[0]) {
        case 's':
          state.seqs.add(Number(parts[1]));
          break;
        case 'c':
          state.checkpoints.push({
            at: Number(parts[1]),
            seq: Number(parts[2]),
          });
          break;
        case 'l':
          state.laggy.set(parts.slice(4).join(' '), {
            name: parts.slice(4).join(' '),
            firstSeen: Number(parts[1]),
            expectedRev: Number(parts[2]),
            seq: parts[3] === '-' ? undefined : Number(parts[3]),
          });
          break;
        case 'w':
          state.lastDeepScanAt =
            parts[1] === '-' ? undefined : Number(parts[1]);
          break;
        default:
          throw new Error(`Unexpected follower state line: ${line}`);
      }
    }
    return state;
  }

  public lastDeepScanAt?: number;

  private checkpoints: Checkpoint[] = [];
  private readonly seqs = new Set<number>();
  private readonly laggy = new Map<string, LaggyPackument>();
  // The threshold below which receipts have already been pruned; avoids
  // re-iterating the (potentially large) receipt set on every checkpoint.
  private prunedBelow = 0;

  //#region Receipts
  /**
   * Whether a receipt exists for the provided sequence number.
   */
  public has(seq: number): boolean {
    return this.seqs.has(seq);
  }

  /**
   * Records receipts for the provided sequence numbers.
   */
  public addSeqs(seqs: Iterable<number>): void {
    for (const seq of seqs) {
      this.seqs.add(seq);
    }
  }

  /**
   * The number of sequence number receipts currently retained.
   */
  public get receiptCount(): number {
    return this.seqs.size;
  }
  //#endregion

  //#region Checkpoints
  /**
   * Records a checkpoint at the current time for the provided sequence
   * number, then prunes checkpoints and receipts that have aged out of the
   * retention window.
   */
  public addCheckpoint(seq: number, now: number = Date.now()): void {
    this.checkpoints.push({ at: now, seq });
    this.prune(now);
  }

  /**
   * The number of checkpoints currently retained.
   */
  public get checkpointCount(): number {
    return this.checkpoints.length;
  }

  /**
   * The sequence number of the newest checkpoint, i.e. the highest feed
   * position a completed scan has read up to. Entries discovered below this
   * position were inserted late. Returns `undefined` when no checkpoints
   * exist.
   */
  public newestCheckpointSeq(): number | undefined {
    return this.checkpoints[this.checkpoints.length - 1]?.seq;
  }

  /**
   * The feed position a scan should re-read from, to cover the provided
   * trailing window: the newest checkpoint at least `windowMs` old. If the
   * checkpoint history does not reach that far back (a young deployment, or a
   * backfill in progress), the newest checkpoint is used: coverage below it
   * is guaranteed, and starting any lower would make long scans restart from
   * the beginning on every run. Returns `undefined` when no checkpoints exist
   * at all.
   */
  public floorSeq(
    windowMs: number,
    now: number = Date.now()
  ): number | undefined {
    let candidate: Checkpoint | undefined;
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.at > now - windowMs) {
        break;
      }
      candidate = checkpoint;
    }
    return (candidate ?? this.checkpoints[this.checkpoints.length - 1])?.seq;
  }

  /**
   * The (approximate) time at which a completed scan first read past the
   * provided sequence number: the timestamp of the earliest checkpoint whose
   * sequence number is `>= seq`. Returns `undefined` if no completed scan has
   * passed that sequence number yet.
   */
  public timeCrossed(seq: number): number | undefined {
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.seq >= seq) {
        return checkpoint.at;
      }
    }
    return undefined;
  }

  /**
   * Discards all position state (receipts and checkpoints). Used when the
   * feed's sequence space is no longer compatible with the recorded state
   * (e.g. the feed head regressed below our newest checkpoint). Laggy
   * packument expectations are package-keyed and remain valid.
   */
  public resetPosition(): void {
    this.checkpoints = [];
    this.seqs.clear();
    this.prunedBelow = 0;
  }
  //#endregion

  //#region Deep scans
  /**
   * Whether a deep scan (covering the full state retention window) is due.
   */
  public deepScanDue(now: number = Date.now()): boolean {
    return (
      this.lastDeepScanAt == null ||
      now - this.lastDeepScanAt >= DEEP_SCAN_INTERVAL_MS
    );
  }

  /**
   * Marks a deep scan as completed at the provided time.
   */
  public completeDeepScan(now: number = Date.now()): void {
    this.lastDeepScanAt = now;
  }
  //#endregion

  //#region Laggy packuments
  /**
   * Records (or extends) the expectation that the registry packument for the
   * provided package should reach the provided revision. The earliest
   * `firstSeen` is retained (so the give-up policy measures from the first
   * occurrence), and the highest announced revision wins.
   */
  public recordLaggyPackument(
    name: string,
    expectedRev: number,
    seq: number | undefined,
    now: number = Date.now()
  ): void {
    const existing = this.laggy.get(name);
    this.laggy.set(name, {
      name,
      expectedRev: Math.max(expectedRev, existing?.expectedRev ?? 0),
      seq: existing?.seq ?? seq,
      firstSeen: existing?.firstSeen ?? now,
    });
  }

  /**
   * Removes the expectation for the provided package (recovered, gone, or
   * given up).
   */
  public removeLaggyPackument(name: string): void {
    this.laggy.delete(name);
  }

  /**
   * All laggy packument expectations, oldest first.
   */
  public laggyPackuments(): LaggyPackument[] {
    return Array.from(this.laggy.values()).sort(
      (a, b) => a.firstSeen - b.firstSeen
    );
  }

  /**
   * The number of laggy packument expectations currently tracked.
   */
  public get laggyPackumentCount(): number {
    return this.laggy.size;
  }
  //#endregion

  public toText(): string {
    const lines = new Array<string>();
    lines.push(STATE_FORMAT_HEADER);
    lines.push(`w ${this.lastDeepScanAt ?? '-'}`);
    for (const { at, seq } of this.checkpoints) {
      lines.push(`c ${at} ${seq}`);
    }
    for (const laggy of this.laggyPackuments()) {
      lines.push(
        `l ${laggy.firstSeen} ${laggy.expectedRev} ${laggy.seq ?? '-'} ${
          laggy.name
        }`
      );
    }
    for (const seq of Array.from(this.seqs).sort((a, b) => a - b)) {
      lines.push(`s ${seq}`);
    }
    lines.push(''); // trailing newline
    return lines.join('\n');
  }

  private prune(now: number): void {
    const cutOff = now - STATE_RETENTION_MS;
    // Always keep at least one checkpoint at or before the cut-off, so that
    // `floorSeq` remains well-defined over the whole retention window.
    let firstRetained = 0;
    for (let i = 0; i < this.checkpoints.length; i++) {
      if (this.checkpoints[i].at <= cutOff) {
        firstRetained = i;
      } else {
        break;
      }
    }
    this.checkpoints = this.checkpoints.slice(firstRetained);

    // Receipts below the earliest retained checkpoint's sequence number can
    // no longer be reached by any scan, so drop them.
    const minSeq = this.checkpoints[0]?.seq ?? 0;
    if (minSeq <= this.prunedBelow) {
      return;
    }
    for (const seq of this.seqs) {
      if (seq < minSeq) {
        this.seqs.delete(seq);
      }
    }
    this.prunedBelow = minSeq;
  }
}
