import {
  RECEIPTS_RETENTION_MS,
  SWEEP_INTERVAL_MS,
  SWEEP_MARGIN_MS,
} from '../../../package-sources/npmjs/constants.lambda-shared';
import { FollowerReceipts } from '../../../package-sources/npmjs/follower-receipts.lambda-shared';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1_000;

test('round-trips through the text format', () => {
  const receipts = new FollowerReceipts();
  receipts.addCheckpoint(90, T0);
  receipts.addSeqs([100, 105, 106, 250]);
  receipts.addCheckpoint(300, T0 + HOUR);
  receipts.lastSweepAt = T0 + HOUR;
  receipts.sweepCursor = { seq: 123, deep: false };

  const restored = FollowerReceipts.fromText(receipts.toText());

  for (const seq of [100, 105, 106, 250]) {
    expect(restored.has(seq)).toBe(true);
  }
  expect(restored.has(101)).toBe(false);
  expect(restored.receiptCount).toBe(4);
  expect(restored.checkpointCount).toBe(2);
  expect(restored.lastSweepAt).toBe(T0 + HOUR);
  expect(restored.sweepCursor).toEqual({ seq: 123, deep: false });
  expect(restored.seqAtOrBefore(T0)).toBe(90);
  expect(restored.seqAtOrBefore(T0 + 2 * HOUR)).toBe(300);
});

test('serializes to a scannable line-based format', () => {
  const receipts = new FollowerReceipts();
  receipts.addCheckpoint(90, T0);
  receipts.addSeqs([250, 100]);
  const text = receipts.toText();

  const lines = text.split('\n');
  expect(lines[0]).toBe('#chreceipts/1');
  // One record per line, greppable, seqs sorted ascending.
  expect(text).toContain(`\nc ${T0} 90\n`);
  expect(text.indexOf('\ns 100\n')).toBeGreaterThan(-1);
  expect(text.indexOf('\ns 100\n')).toBeLessThan(text.indexOf('\ns 250\n'));

  // Garbage input is rejected (so the follower can fall back to a fresh state).
  expect(() => FollowerReceipts.fromText('garbage')).toThrow(
    /Unexpected receipts file header/
  );
});

describe('text format', () => {
  test('produces the exact documented golden output', () => {
    const receipts = new FollowerReceipts();
    receipts.addCheckpoint(90, T0);
    receipts.addCheckpoint(300, T0 + HOUR);
    receipts.addSeqs([100, 250]);
    receipts.lastSweepAt = T0 + HOUR;
    receipts.lastDeepSweepAt = T0;
    receipts.sweepCursor = { seq: 123, deep: true };

    expect(receipts.toText()).toBe(
      [
        '#chreceipts/1',
        `w ${T0 + HOUR} ${T0}`,
        'u 123 deep',
        `c ${T0} 90`,
        `c ${T0 + HOUR} 300`,
        's 100',
        's 250',
        '', // trailing newline
      ].join('\n')
    );
  });

  test('a fresh state round-trips', () => {
    const restored = FollowerReceipts.fromText(new FollowerReceipts().toText());
    expect(restored.receiptCount).toBe(0);
    expect(restored.checkpointCount).toBe(0);
    expect(restored.lastSweepAt).toBeUndefined();
    expect(restored.lastDeepSweepAt).toBeUndefined();
    expect(restored.sweepCursor).toBeUndefined();
  });

  test('serialization is stable (parse . print is identity)', () => {
    const receipts = new FollowerReceipts();
    receipts.addCheckpoint(90, T0);
    receipts.addSeqs([100, 250, 251]);
    receipts.lastSweepAt = T0;
    receipts.sweepCursor = { seq: 42, deep: false };

    const once = receipts.toText();
    const twice = FollowerReceipts.fromText(once).toText();
    expect(twice).toBe(once);
  });

  test('unset sweep timestamps are encoded as "-"', () => {
    const receipts = new FollowerReceipts();
    receipts.lastSweepAt = T0;
    // lastDeepSweepAt remains unset
    expect(receipts.toText()).toContain(`\nw ${T0} -\n`);

    const restored = FollowerReceipts.fromText(receipts.toText());
    expect(restored.lastSweepAt).toBe(T0);
    expect(restored.lastDeepSweepAt).toBeUndefined();
  });

  test('regular and deep sweep cursors round-trip distinctly', () => {
    for (const deep of [true, false]) {
      const receipts = new FollowerReceipts();
      receipts.sweepCursor = { seq: 1_234, deep };
      const restored = FollowerReceipts.fromText(receipts.toText());
      expect(restored.sweepCursor).toEqual({ seq: 1_234, deep });
    }
  });

  test('handles large sequence numbers (beyond 2^31)', () => {
    const bigSeq = 131_711_133_000; // larger than a 32-bit integer
    const receipts = new FollowerReceipts();
    receipts.addCheckpoint(bigSeq - 10, T0);
    receipts.addSeqs([bigSeq]);
    const restored = FollowerReceipts.fromText(receipts.toText());
    expect(restored.has(bigSeq)).toBe(true);
    expect(restored.seqAtOrBefore(T0)).toBe(bigSeq - 10);
  });

  test('round-trips a large receipt set intact', () => {
    const receipts = new FollowerReceipts();
    receipts.addCheckpoint(0, T0);
    const seqs = Array.from({ length: 10_000 }, (_, i) => 131_000_000 + i * 3);
    receipts.addSeqs(seqs);

    const restored = FollowerReceipts.fromText(receipts.toText());
    expect(restored.receiptCount).toBe(10_000);
    expect(restored.has(131_000_000)).toBe(true);
    expect(restored.has(131_000_000 + 9_999 * 3)).toBe(true);
    expect(restored.has(131_000_001)).toBe(false);
  });

  test('tolerates blank lines, surrounding whitespace, and CRLF line endings', () => {
    const text = [
      '#chreceipts/1',
      `w ${T0} -`,
      '',
      `c ${T0} 90 `,
      '  s 100',
      's 250\r',
      '',
    ].join('\n');

    const restored = FollowerReceipts.fromText(text.replace(/\n/g, '\r\n'));
    expect(restored.lastSweepAt).toBe(T0);
    expect(restored.checkpointCount).toBe(1);
    expect(restored.has(100)).toBe(true);
    expect(restored.has(250)).toBe(true);
  });

  test.each([
    ['empty input', ''],
    ['missing header', `w ${T0} -\ns 100\n`],
    ['JSON input (previous format)', '{"seqDeltas":[100]}'],
    ['wrong version', '#chreceipts/2\ns 100\n'],
  ])('rejects %s', (_name, text) => {
    expect(() => FollowerReceipts.fromText(text)).toThrow(
      /Unexpected receipts file header/
    );
  });

  test('rejects unknown record types', () => {
    expect(() =>
      FollowerReceipts.fromText('#chreceipts/1\nx something\n')
    ).toThrow(/Unexpected receipts file line: x something/);
  });
});

test('seqAtOrBefore falls back to earliest checkpoint', () => {
  const receipts = new FollowerReceipts();
  receipts.addCheckpoint(150, T0);
  // Requesting a time before any checkpoint exists yields the earliest one.
  expect(receipts.seqAtOrBefore(T0 - HOUR)).toBe(150);
  // No checkpoints at all yields undefined.
  expect(new FollowerReceipts().seqAtOrBefore(T0)).toBeUndefined();
});

test('timeCrossed reports when the head pass first passed a seq', () => {
  const receipts = new FollowerReceipts();
  receipts.addCheckpoint(100, T0);
  receipts.addCheckpoint(200, T0 + HOUR);
  receipts.addCheckpoint(300, T0 + 2 * HOUR);

  expect(receipts.timeCrossed(150)).toBe(T0 + HOUR);
  expect(receipts.timeCrossed(100)).toBe(T0);
  expect(receipts.timeCrossed(999)).toBeUndefined();
});

test('prunes checkpoints and receipts outside the retention window', () => {
  const receipts = new FollowerReceipts();
  receipts.addSeqs([10, 20, 500, 600]);
  receipts.addCheckpoint(50, T0 - RECEIPTS_RETENTION_MS - 2 * HOUR);
  receipts.addCheckpoint(450, T0 - RECEIPTS_RETENTION_MS - HOUR);
  receipts.addCheckpoint(700, T0);

  // The checkpoint at seq=450 is the last one at/before the cut-off and is
  // retained (so the full retention window remains mappable); the older one
  // is dropped, along with receipts below seq=450.
  expect(receipts.checkpointCount).toBe(2);
  expect(receipts.timeCrossed(500)).toBe(T0);
  expect(receipts.has(10)).toBe(false);
  expect(receipts.has(20)).toBe(false);
  expect(receipts.has(500)).toBe(true);
  expect(receipts.has(600)).toBe(true);
});

describe('sweep scheduling', () => {
  test('first ever sweep is a deep sweep', () => {
    const receipts = new FollowerReceipts();
    expect(receipts.dueSweep(T0)).toBe('deep');
  });

  test('regular sweep is due after the sweep interval', () => {
    const receipts = new FollowerReceipts();
    receipts.completeSweep('deep', T0);
    expect(receipts.dueSweep(T0 + SWEEP_INTERVAL_MS - 1)).toBeUndefined();
    expect(receipts.dueSweep(T0 + SWEEP_INTERVAL_MS)).toBe('regular');
  });

  test('deep sweep is due after the deep sweep interval', () => {
    const receipts = new FollowerReceipts();
    receipts.completeSweep('deep', T0);
    expect(receipts.dueSweep(T0 + 25 * HOUR)).toBe('deep');
  });

  test('an interrupted sweep is resumed first', () => {
    const receipts = new FollowerReceipts();
    receipts.completeSweep('deep', T0);
    receipts.sweepCursor = { seq: 42, deep: false };
    expect(receipts.dueSweep(T0 + 1)).toBe('regular');
    expect(receipts.sweepStartSeq('regular', T0 + 1)).toBe(42);
  });

  test('sweep start seq maps the margin through checkpoints', () => {
    const receipts = new FollowerReceipts();
    receipts.addCheckpoint(100, T0 - SWEEP_MARGIN_MS - HOUR);
    receipts.addCheckpoint(200, T0 - SWEEP_MARGIN_MS);
    receipts.addCheckpoint(900, T0);
    expect(receipts.sweepStartSeq('regular', T0)).toBe(200);
  });
});
