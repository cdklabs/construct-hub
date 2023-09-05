import Case from 'case';
import { Project, SourceCode } from 'projen';
import spdx from 'spdx-license-list';

export function generateSpdxLicenseEnum(project: Project) {
  const ts = new SourceCode(project, 'src/spdx-license.ts');

  ts.line(`// ${ts.marker}`);
  // We *need* the private field to be declared before any public field is...
  ts.line('/* eslint-disable @typescript-eslint/member-ordering */');
  ts.line();
  ts.line('/**');
  ts.line(' * Valid SPDX License identifiers.');
  ts.line(' */');
  ts.open('export class SpdxLicense {');
  ts.line('private static readonly _ALL = new Map<string, SpdxLicense>();');
  ts.line();
  ts.line('//#region Individual SPDX Licenses');
  for (const [id, { name, url, osiApproved }] of Object.entries(spdx)) {
    ts.line('/**');
    ts.line(` * ${name}`);
    if (osiApproved) {
      ts.line(' *');
      ts.line(' * @osiApproved');
    }
    ts.line(' *');
    ts.line(` * @see ${url}`);
    ts.line(' */');
    ts.line(
      `public static readonly ${slugify(id)} = new SpdxLicense('${id}');`
    );
    ts.line();
  }

  ts.line('/** Packages that have not been licensed */');
  ts.line("public static readonly UNLICENSED = new SpdxLicense('UNLICENSED');");
  ts.line('//#endregion');

  ts.line();
  ts.line('//#region Bundles of SPDX Licenses');

  ts.line();
  ts.line('/** All valid SPDX Licenses */');
  ts.open('public static all(): SpdxLicense[] {');
  ts.line('return Array.from(SpdxLicense._ALL.values());');
  ts.close('}');

  ts.line();
  ts.line('/** All OSI-Approved SPDX Licenses */');
  ts.open('public static osiApproved(): SpdxLicense[] {');
  ts.open('return [');
  for (const [id, { osiApproved }] of Object.entries(spdx)) {
    if (!osiApproved) {
      continue;
    }
    ts.line(`SpdxLicense.${slugify(id)},`);
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The Apache family of licenses */');
  ts.open('public static apache(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('Apache-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The BSD family of licenses */');
  ts.open('public static bsd(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id === '0BSD' || id.startsWith('BSD-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The CDDL family of licenses */');
  ts.open('public static cddl(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('CDDL-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The EPL family of licenses */');
  ts.open('public static epl(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('EPL-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The MIT family of licenses */');
  ts.open('public static mit(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (
      id === 'AML' ||
      id === 'MIT' ||
      id === 'MITNFA' ||
      id.startsWith('MIT-')
    ) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The MPL family of licenses */');
  ts.open('public static mpl(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('MPL-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');
  ts.line('//#endregion');

  ts.line();
  ts.open('private constructor(public readonly id: string) {');
  ts.line('/* istanbul ignore if (should never happen) */');
  ts.open('if (SpdxLicense._ALL.has(id)) {');
  ts.line('throw new Error(`Duplicated SPDX License ID: ${id}`);');
  ts.close('}');
  ts.line('SpdxLicense._ALL.set(id, this);');
  ts.close('}');

  ts.close('}');

  function slugify(id: string) {
    // Applying twice - some values don't re-constantize cleanly, and `jsii`
    // will actually check the case by re-constantizing those... This is silly,
    // but fixing that is likely going to be a breaking change T_T.
    return Case.constant(
      Case.constant(
        id.replace(/\+$/, '_Plus').replace(/^(\d)/, (digit: string) => {
          switch (digit) {
            case '0':
              return 'Zero_';
            case '1':
              return 'One_';
            case '2':
              return 'Two_';
            case '3':
              return 'Three_';
            case '4':
              return 'Four_';
            case '5':
              return 'Five_';
            case '6':
              return 'Six_';
            case '7':
              return 'Seven_';
            case '8':
              return 'Eight_';
            case '9':
              return 'Nine_';
            default:
              return digit;
          }
        })
      )
    );
  }
}
