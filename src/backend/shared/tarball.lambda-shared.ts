import { createGunzip } from 'zlib';
import { Readable } from 'streamx';
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
export async function extractObjects<S extends Selector>(
  tgz: Buffer,
  selector: S
): Promise<Selection<S>> {
  return new Promise((ok, ko) => {
    const result: { [name: string]: Buffer } = {};

    // The readable will send data in chubks of 4KiB here.
    let idx = 0;
    new Readable({
      read(cb) {
        let drained = true;
        while (drained && idx < tgz.length) {
          const slice = tgz.slice(idx, idx + 4_096);
          drained = this.push(slice);
          idx += slice.length;
        }

        // If we've sent it all, we'll cork it by pushing null.
        if (idx >= tgz.length) {
          this.push(null);
        }
        cb(null);
      },
    })
      .pipe(createGunzip())
      .pipe(extract({ filenameEncoding: 'utf-8' }), { end: true })
      .once('error', ko)
      .once('finish', () => {
        for (const [name, { path, required }] of Object.entries(selector)) {
          if (!required) {
            continue;
          }
          if (!(name in result)) {
            const err = new Error(
              `Missing required entry in tarball: ${name} (${
                path ?? '<dynamic>'
              })`
            );
            Error.captureStackTrace(err);
            ko(err);
            return;
          }
        }
        ok(result as Selection<S>);
      })
      .on('entry', (headers, stream, next) => {
        const selected = Object.entries(selector).find(([_, config]) =>
          selectorMatches(headers.name, config)
        );
        const chunks = selected != null ? new Array<Buffer>() : undefined;
        if (chunks != null) {
          stream.on('data', (chunk) => chunks?.push(Buffer.from(chunk)));
        }
        // Un-conditionally consume the `stream`, as not doing so weill prevent the tar-stream from continuing to
        // process more entries...
        stream
          .once('error', next)
          .once('end', () => {
            if (selected != null && chunks != null) {
              const [name] = selected;
              result[name] = Buffer.concat(chunks);
            }
            next();
          })
          .resume();
        return;
      });
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
type SelectorProperty = { readonly required?: boolean } & (
  | { readonly path: string }
  | { readonly path?: undefined; readonly filter: (path: string) => boolean }
);

type Selection<S extends Selector> = {
  readonly [P in keyof S]: S[P] extends { readonly required: true }
    ? Buffer
    : Buffer | undefined;
};
