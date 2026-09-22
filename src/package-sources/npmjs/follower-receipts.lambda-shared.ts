import {
  RECEIPTS_RETENTION_MS,
  SWEEP_INTERVAL_MS,
  DEEP_SWEEP_INTERVAL_MS,
  SWEEP_MARGIN_MS,
} from './constants.lambda-shared';

/**
 * A point-in-time record of where the follower's head-of-feed pass was in the
 * `_changes` feed.
 */
export interface Checkpoint {
  /**
   * Epoch milliseconds at which the checkpoint was taken.
   */
  readonly at: number;

  /**
   * The `last_seq` value the head-of-feed pass had reached at that time.
   */
  readonly seq: number;
}

/**
 * The persisted receipts file uses a newline-delimited plain-text format, so
 * it can be scanned cheaply (e.g. `grep '^s 131711133$'`) and parsed without
 * materializing a large JSON document. Each line is a record identified by
 * its first token:
 *
 * ```text
 * #chreceipts/1                 <- header (format magic + version)
 * w <lastSweepAt> <lastDeepSweepAt>   <- sweep state ("-" when unset)
 * u <seq> <deep|regular>        <- sweep cursor (only when a sweep was interrupted)
 * c <at> <seq>                  <- checkpoint (repeated, ascending by time)
 * s <seq>                       <- received sequence number (repeated, ascending)
 * ```
 */
const RECEIPTS_FORMAT_HEADER = '#chreceipts/1';

export interface SweepCursor {
  /**
   * The sequence number to resume the sweep from.
   */
  readonly seq: number;

  /**
   * Whether the interrupted sweep was a deep sweep.
   */
  readonly deep: boolean;
}

/**
 * Tracks which `_changes` feed rows (by sequence number) the follower has
 * already received, together with rolling time/seq checkpoints and sweep
 * state.
 *
 * The npm `_changes` feed does not guarantee that rows only ever appear with
 * a sequence number greater than previously returned `last_seq` values: rows
 * are occasionally inserted *behind* the cursor. The receipt set upgrades the
 * follower's position tracking from "I have processed everything up to X" to
 * "here is exactly what I received up to X", enabling a cheap overlap sweep
 * that re-reads a trailing window and only processes rows it has no receipt
 * for.
 */
export class FollowerReceipts {
  public static fromText(text: string): FollowerReceipts {
    const receipts = new FollowerReceipts();
    const lines = text.split('\n');
    if (lines[0]?.trim() !== RECEIPTS_FORMAT_HEADER) {
      throw new Error(
        `Unexpected receipts file header: ${JSON.stringify(lines[0])}`
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
          receipts.seqs.add(Number(parts[1]));
          break;
        case 'c':
          receipts.checkpoints.push({
            at: Number(parts[1]),
            seq: Number(parts[2]),
          });
          break;
        case 'w':
          receipts.lastSweepAt =
            parts[1] === '-' ? undefined : Number(parts[1]);
          receipts.lastDeepSweepAt =
            parts[2] === '-' ? undefined : Number(parts[2]);
          break;
        case 'u':
          receipts.sweepCursor = {
            seq: Number(parts[1]),
            deep: parts[2] === 'deep',
          };
          break;
        default:
          throw new Error(`Unexpected receipts file line: ${line}`);
      }
    }
    return receipts;
  }

  public lastSweepAt?: number;
  public lastDeepSweepAt?: number;
  public sweepCursor?: SweepCursor;

  private checkpoints: Checkpoint[] = [];
  private readonly seqs = new Set<number>();

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
   * The number of sequence number receipts currently retained.
   */
  public get receiptCount(): number {
    return this.seqs.size;
  }

  /**
   * The sequence number the head-of-feed pass had reached at (or before) the
   * provided time. If the checkpoint history does not reach that far back,
   * the earliest known checkpoint's sequence number is returned. Returns
   * `undefined` if no checkpoints exist at all.
   */
  public seqAtOrBefore(timeMs: number): number | undefined {
    let candidate: Checkpoint | undefined;
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.at > timeMs) {
        break;
      }
      candidate = checkpoint;
    }
    return (candidate ?? this.checkpoints[0])?.seq;
  }

  /**
   * The (approximate) time at which the head-of-feed pass first read past the
   * provided sequence number: the timestamp of the earliest checkpoint whose
   * sequence number is `>= seq`. Returns `undefined` if the head-of-feed pass
   * has not passed that sequence number yet (or no checkpoints exist).
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
   * Determines the kind of sweep that is due, if any. Deep sweeps take
   * precedence over regular sweeps. An interrupted sweep (cursor present) is
   * always resumed first.
   */
  public dueSweep(now: number = Date.now()): 'deep' | 'regular' | undefined {
    if (this.sweepCursor != null) {
      return this.sweepCursor.deep ? 'deep' : 'regular';
    }
    if (
      this.lastDeepSweepAt == null ||
      now - this.lastDeepSweepAt >= DEEP_SWEEP_INTERVAL_MS
    ) {
      return 'deep';
    }
    if (
      this.lastSweepAt == null ||
      now - this.lastSweepAt >= SWEEP_INTERVAL_MS
    ) {
      return 'regular';
    }
    return undefined;
  }

  /**
   * The sequence number a sweep of the given kind should start from, based on
   * the checkpoint history. Returns `undefined` when there is not any
   * checkpoint history to sweep over.
   */
  public sweepStartSeq(
    kind: 'deep' | 'regular',
    now: number = Date.now()
  ): number | undefined {
    if (this.sweepCursor != null) {
      return this.sweepCursor.seq;
    }
    const margin = kind === 'deep' ? RECEIPTS_RETENTION_MS : SWEEP_MARGIN_MS;
    return this.seqAtOrBefore(now - margin);
  }

  /**
   * Marks a sweep of the given kind as completed at the provided time.
   * Completing a deep sweep also completes a regular sweep (it covers a
   * superset of the regular window).
   */
  public completeSweep(kind: 'deep' | 'regular', now: number = Date.now()) {
    this.sweepCursor = undefined;
    this.lastSweepAt = now;
    if (kind === 'deep') {
      this.lastDeepSweepAt = now;
    }
  }

  public toText(): string {
    const lines = new Array<string>();
    lines.push(RECEIPTS_FORMAT_HEADER);
    lines.push(`w ${this.lastSweepAt ?? '-'} ${this.lastDeepSweepAt ?? '-'}`);
    if (this.sweepCursor != null) {
      lines.push(
        `u ${this.sweepCursor.seq} ${
          this.sweepCursor.deep ? 'deep' : 'regular'
        }`
      );
    }
    for (const { at, seq } of this.checkpoints) {
      lines.push(`c ${at} ${seq}`);
    }
    for (const seq of Array.from(this.seqs).sort((a, b) => a - b)) {
      lines.push(`s ${seq}`);
    }
    lines.push(''); // trailing newline
    return lines.join('\n');
  }

  private prune(now: number): void {
    const cutOff = now - RECEIPTS_RETENTION_MS;
    // Always keep at least one checkpoint at or before the cut-off, so that
    // `seqAtOrBefore` remains well-defined over the whole retention window.
    let firstRetained = 0;
    for (let i = 0; i < this.checkpoints.length; i++) {
      if (this.checkpoints[i].at <= cutOff) {
        firstRetained = i;
      } else {
        break;
      }
    }
    this.checkpoints = this.checkpoints.slice(firstRetained);

    // Receipts older (lower) than the earliest retained checkpoint's sequence
    // number can no longer be reached by any sweep, so drop them.
    const minSeq = this.checkpoints[0]?.seq ?? 0;
    for (const seq of this.seqs) {
      if (seq < minSeq) {
        this.seqs.delete(seq);
      }
    }
  }
}
