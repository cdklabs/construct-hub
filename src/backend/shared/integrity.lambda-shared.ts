import { createHash } from 'crypto';
import type { IngestionInput } from './ingestion-input.lambda-shared';

/**
 * Computes an integrity checksum for the provided `IngestionInput`.
 *
 * @param input   the `IngestionInput` for which to make a checksum.
 * @param tarball the content of the `.tgz` npm package
 * @param alg     the hash algorithm to use (e.g: 'sha384')
 *
 * @returns the computed checksum.
 */
export function integrity(
  input: Input,
  tarball: Uint8Array,
  alg = input.integrity?.split('-')[0] ?? 'sha384'
): IngestionInput {
  const hash = createHash(alg);
  const addField = (name: string, data: string | Uint8Array) =>
    //           <SOH>        $name          <STX>        $data          <ETX>
    hash.update('\x01').update(name).update('\x02').update(data).update('\x03');

  for (const [name, value] of Object.entries(input.metadata ?? {}).sort(
    ([l], [r]) => l.localeCompare(r)
  )) {
    addField(`metadata/${name}`, value);
  }
  addField('tarball', tarball);
  addField('time', input.time);

  return {
    ...input,
    integrity: `${alg}-${hash.digest('base64')}`,
  };
}

interface Input extends Omit<IngestionInput, 'integrity'> {
  readonly integrity?: string;
}
