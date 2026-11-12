import { mergeCidrs as mergeCidrBlocks } from '../../util/cidr-manipulation';

/** Adapter so test cases can be written with plain strings */
function mergeCidrs(maxEntries: number, cidrs: string[]): string[] {
  return mergeCidrBlocks(
    maxEntries,
    cidrs.map((cidr) => ({ cidr }))
  ).map((b) => b.cidr);
}

test('returns input normalized when already under the limit', () => {
  expect(mergeCidrs(5, ['10.0.0.5/24', '192.168.1.1'])).toEqual([
    '10.0.0.0/24',
    '192.168.1.1/32',
  ]);
});

test('drops contained ranges and duplicates', () => {
  expect(mergeCidrs(5, ['10.0.0.0/8', '10.1.2.0/24', '10.0.0.0/8'])).toEqual([
    '10.0.0.0/8',
  ]);
});

test('merges adjacent ranges before distant ones', () => {
  expect(
    mergeCidrs(2, ['10.0.0.0/25', '10.0.0.128/25', '192.168.0.0/24'])
  ).toEqual(['10.0.0.0/24', '192.168.0.0/24']);
});

test('merges smallest gap first', () => {
  expect(mergeCidrs(2, ['1.0.0.0/24', '1.0.2.0/24', '1.0.100.0/24'])).toEqual([
    '1.0.0.0/22',
    '1.0.100.0/24',
  ]);
});

test('supernet swallows ranges before the merged pair', () => {
  // merging 10.0.0.8/29 and 10.0.0.16/29 gives 10.0.0.0/27, which also covers 10.0.0.0/30
  expect(
    mergeCidrs(2, ['10.0.0.0/30', '10.0.0.8/29', '10.0.0.16/29', '200.0.0.0/8'])
  ).toEqual(['10.0.0.0/27', '200.0.0.0/8']);
});

test('can merge down to a single entry', () => {
  expect(mergeCidrs(1, ['0.0.0.0/1', '255.0.0.0/8'])).toEqual(['0.0.0.0/0']);
});

test('rejects invalid input', () => {
  expect(() => mergeCidrs(1, ['10.0.0.256/8'])).toThrow(/valid/);
  expect(() => mergeCidrs(1, ['2001:db8::/32'])).toThrow(/valid/);
  expect(() => mergeCidrs(0, ['10.0.0.0/8'])).toThrow(/maxEntries/);
});
