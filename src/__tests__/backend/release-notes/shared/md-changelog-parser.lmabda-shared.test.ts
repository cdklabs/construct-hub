import { getReleaseNotesMd } from '../../../../backend/release-notes/shared/md-changelog-parser.lambda-shared';

describe('changelog parser generates logs', () => {
  // atx style header https://spec-md.com/#sel-GAFLHDABABhEzwD
  test.each([
    ['h1', '#'],
    ['h2', '##'],
    ['h3', '###'],
    ['h4', '####'],
    ['h5', '####'],
    ['h6', '####'],
  ])('from atx style header %s => %s', async (_heading, mdStr) => {
    const features1 = [
      '* **pkgName:** Some feature ([#1234](https://github.com/somerepo/somepkg/issues/1234)) ([dba96a9](https://github.com/somerepo/somepkg/commits/dba96a9)',
      '* **pkgName2:** Some other feature ([#1236](https://github.com/somerepo/somepkg/issues/1236)) ([dba96a1](https://github.com/somerepo/somepkg/commits/dba96a1)',
    ];

    const bugfixes1 = [
      '* **core:** Core fix ([#122](https://github.com/somerepo/somepkg/issues/122)) ([ba96aaa7](https://github.com/somerepo/somepkg/commits/ba96aaa7)',
    ];

    const bugfixes2 = [
      '* **pkgName12:** Bugfix 1 ([#12](https://github.com/somerepo/somepkg/issues/12)) ([89dba96aa](https://github.com/somerepo/somepkg/commits/89dba96aa)',
      '* bugfix 2',
    ];


    const changelogMdStr = [
      'All notable changes to this project will be documented in this file.',
      `${mdStr} [1.152.0](https://github.com/somerepo/somepkg/compare/v1.151.0...v1.152.0) (2022-04-06)`,
      `${mdStr}# Features`,
      ...features1,
      ...bugfixes2,
      `${mdStr} [1.151.0](https://github.com/somerepo/somepkg/compare/v1.150.0...v1.151.0)`,
      ...bugfixes1,
    ].join('\n');

    const expectedChangeLog1 = [
      `${mdStr}# Features`,
      ...features1,
      ...bugfixes2,
    ].join('\n');

    const expectedChangeLog2 = [
      ...bugfixes1,
    ].join('\n');

    await expect(getReleaseNotesMd(changelogMdStr, '1.152.0')).resolves.toEqual(expectedChangeLog1);

    await expect(getReleaseNotesMd(changelogMdStr, '1.151.0')).resolves.toEqual(expectedChangeLog2);

  });


  test.each([['h1', '==='], ['h2', '---']])('from setext style header for %s', async (_heading: string, headingFooter: string) => {

    const features1 = [
      '* **pkgName:** Some feature ([#1234](https://github.com/somerepo/somepkg/issues/1234)) ([dba96a9](https://github.com/somerepo/somepkg/commits/dba96a9)',
      '* **pkgName2:** Some other feature ([#1236](https://github.com/somerepo/somepkg/issues/1236)) ([dba96a1](https://github.com/somerepo/somepkg/commits/dba96a1)',
    ];

    const bugfixes1 = [
      '* **core:** Core fix ([#122](https://github.com/somerepo/somepkg/issues/122)) ([ba96aaa7](https://github.com/somerepo/somepkg/commits/ba96aaa7)',
    ];

    const bugfixes2 = [
      '* **pkgName12:** Bugfix 1 ([#12](https://github.com/somerepo/somepkg/issues/12)) ([89dba96aa](https://github.com/somerepo/somepkg/commits/89dba96aa)',
      '* bugfix 2',
    ];


    const changelogMdStr = [
      'All notable changes to this project will be documented in this file.',
      '', // empty new line to mark beginning heading
      '[1.152.0](https://github.com/somerepo/somepkg/compare/v1.151.0...v1.152.0) (2022-04-06)',
      headingFooter,
      '### Features',
      ...features1,
      ...bugfixes2,
      '', // empty new line to mark beginning heading
      '[1.151.0](https://github.com/somerepo/somepkg/compare/v1.150.0...v1.151.0)',
      headingFooter,
      ...bugfixes1,
    ].join('\n');

    const expectedChangeLog1 = [
      '### Features',
      ...features1,
      ...bugfixes2,
    ].join('\n');

    const expectedChangeLog2 = [
      ...bugfixes1,
    ].join('\n');

    await expect(getReleaseNotesMd(changelogMdStr, '1.152.0')).resolves.toEqual(expectedChangeLog1);

    await expect(getReleaseNotesMd(changelogMdStr, '1.151.0')).resolves.toEqual(expectedChangeLog2);
  });
});