/* eslint-disable no-bitwise */
import { CidrBlock } from '../_limited-internet-access';

/**
 * From the given list of CIDRs, keep on progressively merging the ranges with the smallest distances between them until there are at most `maxEntries` left.
 *
 * Overlapping ranges are considered to have 0 distance between them so will be merged first, followed by ranges with the smallest gaps between them, and so on.
 */
export function mergeCidrs(
  maxEntries: number,
  cidrs: CidrBlock[]
): CidrBlock[] {
  if (maxEntries < 1 && cidrs.length > 0) {
    throw new Error(`maxEntries must be at least 1, got ${maxEntries}`);
  }

  // Sorted by start; ranges contained in an earlier range are dropped. CIDRs either nest or are disjoint,
  // so after this the list is strictly increasing and non-overlapping.
  let ranges = normalize(cidrs.map(parseCidr));

  while (ranges.length > maxEntries) {
    let best = 0;
    for (let i = 1; i < ranges.length - 1; i++) {
      if (gap(ranges[i], ranges[i + 1]) < gap(ranges[best], ranges[best + 1])) {
        best = i;
      }
    }
    const merged = supernet(ranges[best], ranges[best + 1]);
    // The supernet may start before (and swallow) earlier ranges, so re-normalize everything
    ranges = normalize([
      ...ranges.slice(0, best),
      merged,
      ...ranges.slice(best + 2),
    ]);
  }

  return ranges.map(formatCidr).map((cidr) => ({ cidr }));
}

interface Range {
  /** First address, as an unsigned 32-bit integer */
  readonly start: number;
  /** Last address, as an unsigned 32-bit integer */
  readonly end: number;
  readonly prefix: number;
}

// shortcut: IPv4 only, add BigInt-based IPv6 support if a caller needs it.
function parseCidr(cidr: CidrBlock): Range {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(
    cidr.cidr.trim()
  );
  const octets = m?.slice(1, 5).map(Number);
  const prefix = m?.[5] !== undefined ? Number(m[5]) : 32;
  if (!octets || octets.some((o) => o > 255) || prefix > 32) {
    throw new Error(`Not a valid IPv4 CIDR: ${cidr.cidr}`);
  }
  const addr = octets.reduce((acc, o) => acc * 256 + o, 0);
  return makeRange(addr, prefix);
}

function makeRange(addr: number, prefix: number): Range {
  const size = 2 ** (32 - prefix);
  const start = Math.floor(addr / size) * size; // normalize host bits away
  return { start, end: start + size - 1, prefix };
}

function formatCidr({ start, prefix }: Range): string {
  return `${[24, 16, 8, 0]
    .map((s) => (start >>> s) & 255)
    .join('.')}/${prefix}`;
}

function gap(a: Range, b: Range): number {
  return Math.max(0, b.start - a.end - 1);
}

/** Smallest CIDR covering both ranges */
function supernet(a: Range, b: Range): Range {
  const diff = (Math.min(a.start, b.start) ^ Math.max(a.end, b.end)) >>> 0;
  return makeRange(
    Math.min(a.start, b.start),
    Math.min(Math.clz32(diff), a.prefix, b.prefix)
  );
}

/** Sort by start (bigger range first on ties) and drop ranges contained in another one. */
function normalize(ranges: Range[]): Range[] {
  const result: Range[] = [];
  for (const r of [...ranges].sort(
    (a, b) => a.start - b.start || a.prefix - b.prefix
  )) {
    if (result.length === 0 || r.end > result[result.length - 1].end) {
      result.push(r);
    }
  }
  return result;
}
