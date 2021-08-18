import { createGunzip } from 'zlib';
import { extract } from 'tar-stream';

/**
 * Extracts objects from a compressed tarball (.tgz file). Selectors are
 * provided as a map from result key to a selector configuration object, which
 * can specify whether the object is required (`required: true`) or not (a
 * missing required object will cause the extraction to throw an error), and
 * either a path name (exact match with the contents of the tarball), or a
 * filter function. Selector properties are applied in the order in which they
 * are defined: the first matching selector gets used to select the object. If
 * a selector matches multiple objects in the tarball, the last matched object
 * is returned.
 *
 * @param tgz      the compressed tarbal data in a `Buffer`.
 * @param selector the objects to be extracted from the tarball.
 *
 * @returns the extracted objects.
 */
export async function extractObjects<S extends Selector>(tgz: Buffer, selector: S): Promise<Selection<S>> {
  const tarball = await gunzip(tgz);
  return new Promise((ok, ko) => {
    const result: { [name: string]: Buffer } = {};
    const extractor = extract({ filenameEncoding: 'utf-8' })
      .once('error', ko)
      .once('finish', () => {
        for (const [name, { path, required }] of Object.entries(selector)) {
          if (!required) {
            continue;
          }
          if (!(name in result)) {
            const err = new Error(`Missing required entry in tarball: ${name} (${path ?? '<dynamic>'}`);
            Error.captureStackTrace(err);
            ko(err);
            return;
          }
        }
        ok(result as Selection<S>);
      })
      .on('entry', (headers, stream, next) => {
        for (const [name, config] of Object.entries(selector)) {
          if (selectorMatches(headers.name, config)) {
            const chunks = new Array<Buffer>();
            stream.once('error', ko)
              .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
              .once('end', () => {
                result[name] = Buffer.concat(chunks);
                // Running `next` on the next runLoop iteration to avoid stack overflow
                setImmediate(next);
              })
              .resume();
            return;
          }
        }
        // Running `next` on the next runLoop iteration to avoid stack overflow
        setImmediate(next);
      });
    extractor.write(tarball, (err) => {
      if (err != null) {
        ko(err);
      }
      extractor.end();
    });
  });
}

function gunzip(gz: Buffer): Promise<Buffer> {
  return new Promise((ok, ko) => {
    const chunks = new Array<Buffer>();
    createGunzip()
      .once('error', ko)
      .on('data', chunk => chunks.push(Buffer.from(chunk)))
      .once('end', () => ok(Buffer.concat(chunks)))
      .end(gz);
  });
}

function selectorMatches(path: string, config: SelectorProperty): boolean {
  if ('path' in config) {
    return path === config.path;
  }
  return config.filter(path);
}

interface Selector {
  readonly [name: string]: SelectorProperty;
}
type SelectorProperty = { readonly required?: boolean }
& ({ readonly path: string } | { readonly path?: undefined; readonly filter: (path: string) => boolean });

type Selection<S extends Selector> = {
  readonly [P in keyof S]: S[P] extends { readonly required: true } ? Buffer : Buffer | undefined;
};
