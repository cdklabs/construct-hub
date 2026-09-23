import {
  DEEP_SCAN_INTERVAL_MS,
  SCAN_WINDOW_MS,
  STATE_RETENTION_MS,
} from '../../../package-sources/npmjs/constants.lambda-shared';
import { FollowerState } from '../../../package-sources/npmjs/follower-state.lambda-shared';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1_000;

describe('text format', () => {
  test('produces the exact documented golden output', () => {
    const state = new FollowerState();
    state.addCheckpoint(90, T0);
    state.addCheckpoint(300, T0 + HOUR);
    state.addSeqs([100, 250]);
    state.recordLaggyPackument('@scope/laggy-package', 5, 123, T0);
    state.completeDeepScan(T0 + HOUR);

    expect(state.toText()).toBe(
      [
        '#chfollower/1',
        `w ${T0 + HOUR}`,
        `c ${T0} 90`,
        `c ${T0 + HOUR} 300`,
        `l ${T0} 5 123 @scope/laggy-package`,
        's 100',
        's 250',
        '', // trailing newline
      ].join('\n')
    );
  });

  test('round-trips through the text format', () => {
    const state = new FollowerState();
    state.addCheckpoint(90, T0);
    state.addSeqs([100, 105, 250]);
    state.recordLaggyPackument('laggy-package', 7, undefined, T0);
    state.completeDeepScan(T0);

    const restored = FollowerState.fromText(state.toText());

    for (const seq of [100, 105, 250]) {
      expect(restored.has(seq)).toBe(true);
    }
    expect(restored.has(101)).toBe(false);
    expect(restored.receiptCount).toBe(3);
    expect(restored.checkpointCount).toBe(1);
    expect(restored.lastDeepScanAt).toBe(T0);
    expect(restored.laggyPackuments()).toEqual([
      { name: 'laggy-package', expectedRev: 7, seq: undefined, firstSeen: T0 },
    ]);
  });

  test('a fresh state round-trips', () => {
    const restored = FollowerState.fromText(new FollowerState().toText());
    expect(restored.receiptCount).toBe(0);
    expect(restored.checkpointCount).toBe(0);
    expect(restored.laggyPackumentCount).toBe(0);
    expect(restored.lastDeepScanAt).toBeUndefined();
  });

  test('serialization is stable (parse . print is identity)', () => {
    const state = new FollowerState();
    state.addCheckpoint(90, T0);
    state.addSeqs([100, 250, 251]);
    state.recordLaggyPackument('laggy-package', 7, 200, T0);

    const once = state.toText();
    const twice = FollowerState.fromText(once).toText();
    expect(twice).toBe(once);
  });

  test('handles large sequence numbers (beyond 2^31)', () => {
    const bigSeq = 131_711_133_000;
    const state = new FollowerState();
    state.addCheckpoint(bigSeq - 10, T0);
    state.addSeqs([bigSeq]);
    const restored = FollowerState.fromText(state.toText());
    expect(restored.has(bigSeq)).toBe(true);
  });

  test('round-trips a large receipt set intact', () => {
    const state = new FollowerState();
    state.addCheckpoint(0, T0);
    state.addSeqs(
      Array.from({ length: 10_000 }, (_, i) => 131_000_000 + i * 3)
    );
    const restored = FollowerState.fromText(state.toText());
    expect(restored.receiptCount).toBe(10_000);
    expect(restored.has(131_000_000)).toBe(true);
    expect(restored.has(131_000_001)).toBe(false);
  });

  test('tolerates blank lines, surrounding whitespace, and CRLF line endings', () => {
    const text = [
      '#chfollower/1',
      'w -',
      '',
      `c ${T0} 90 `,
      '  s 100',
      's 250\r',
      '',
    ].join('\n');

    const restored = FollowerState.fromText(text.replace(/\n/g, '\r\n'));
    expect(restored.checkpointCount).toBe(1);
    expect(restored.has(100)).toBe(true);
    expect(restored.has(250)).toBe(true);
  });

  test.each([
    ['empty input', ''],
    ['missing header', 'w -\ns 100\n'],
    ['JSON input', '{"seqs":[100]}'],
    ['wrong version', '#chfollower/2\ns 100\n'],
  ])('rejects %s', (_name, text) => {
    expect(() => FollowerState.fromText(text)).toThrow(
      /Unexpected follower state header/
    );
  });

  test('rejects unknown record types', () => {
    expect(() =>
      FollowerState.fromText('#chfollower/1\nx something\n')
    ).toThrow(/Unexpected follower state line: x something/);
  });
});

describe('checkpoints and receipts', () => {
  test('floorSeq maps the window through checkpoints', () => {
    const state = new FollowerState();
    state.addCheckpoint(100, T0 - SCAN_WINDOW_MS - HOUR);
    state.addCheckpoint(200, T0 - SCAN_WINDOW_MS);
    state.addCheckpoint(900, T0);
    expect(state.floorSeq(SCAN_WINDOW_MS, T0)).toBe(200);
  });

  test('floorSeq falls back to the newest checkpoint when history is younger than the window', () => {
    const state = new FollowerState();
    state.addCheckpoint(150, T0 - HOUR);
    state.addCheckpoint(900, T0 - 30 * 60_000);
    // No checkpoint is older than the window: coverage below the newest one
    // is guaranteed, so the scan resumes from there.
    expect(state.floorSeq(SCAN_WINDOW_MS, T0)).toBe(900);
    expect(new FollowerState().floorSeq(SCAN_WINDOW_MS, T0)).toBeUndefined();
  });

  test('timeCrossed reports when a completed scan first passed a seq', () => {
    const state = new FollowerState();
    state.addCheckpoint(100, T0);
    state.addCheckpoint(200, T0 + HOUR);
    state.addCheckpoint(300, T0 + 2 * HOUR);

    expect(state.timeCrossed(150)).toBe(T0 + HOUR);
    expect(state.timeCrossed(100)).toBe(T0);
    expect(state.timeCrossed(999)).toBeUndefined();
  });

  test('prunes checkpoints and receipts outside the retention window', () => {
    const state = new FollowerState();
    state.addCheckpoint(50, T0 - STATE_RETENTION_MS - 2 * HOUR);
    state.addCheckpoint(450, T0 - STATE_RETENTION_MS - HOUR);
    state.addSeqs([460, 500, 600]);
    state.addCheckpoint(700, T0);

    // The checkpoint at seq=450 is the last one at/before the cut-off and is
    // retained; the older one is dropped, along with receipts below seq=450.
    expect(state.checkpointCount).toBe(2);
    expect(state.has(460)).toBe(true);
    expect(state.has(500)).toBe(true);
  });

  test('resetPosition clears receipts and checkpoints but keeps laggy packuments', () => {
    const state = new FollowerState();
    state.addCheckpoint(100, T0);
    state.addSeqs([150]);
    state.recordLaggyPackument('laggy-package', 5, 120, T0);

    state.resetPosition();

    expect(state.checkpointCount).toBe(0);
    expect(state.receiptCount).toBe(0);
    expect(state.newestCheckpointSeq()).toBeUndefined();
    expect(state.laggyPackumentCount).toBe(1);
  });
});

describe('deep scans', () => {
  test('the first ever scan is deep', () => {
    expect(new FollowerState().deepScanDue(T0)).toBe(true);
  });

  test('a deep scan is due again after the interval', () => {
    const state = new FollowerState();
    state.completeDeepScan(T0);
    expect(state.deepScanDue(T0 + DEEP_SCAN_INTERVAL_MS - 1)).toBe(false);
    expect(state.deepScanDue(T0 + DEEP_SCAN_INTERVAL_MS)).toBe(true);
  });
});

describe('laggy packuments', () => {
  test('keeps the earliest firstSeen and the highest expected revision', () => {
    const state = new FollowerState();
    state.recordLaggyPackument('laggy-package', 5, 100, T0);
    state.recordLaggyPackument('laggy-package', 7, 200, T0 + HOUR);
    state.recordLaggyPackument('laggy-package', 6, 300, T0 + 2 * HOUR);

    expect(state.laggyPackuments()).toEqual([
      { name: 'laggy-package', expectedRev: 7, seq: 100, firstSeen: T0 },
    ]);
  });

  test('lists expectations oldest first and removes them', () => {
    const state = new FollowerState();
    state.recordLaggyPackument('second', 2, undefined, T0 + HOUR);
    state.recordLaggyPackument('first', 1, undefined, T0);

    expect(state.laggyPackuments().map((l) => l.name)).toEqual([
      'first',
      'second',
    ]);

    state.removeLaggyPackument('first');
    expect(state.laggyPackumentCount).toBe(1);
  });
});
