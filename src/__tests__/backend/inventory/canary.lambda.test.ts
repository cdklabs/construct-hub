import {
  serialize,
  deserialize,
  InventoryCanaryState,
  Grain,
  DocumentationStatus,
} from '../../../backend/inventory/canary.lambda';

test('can serialize and deserialize the inventory state', () => {
  // GIVEN
  const state: InventoryCanaryState = {
    continuationToken: 'token',
    indexedPackages: new Map([
      [
        'package1',
        {
          metadataPresent: true,
          assemblyPresent: true,
          uninstallable: false,
          submodules: new Set(['submodule1', 'submodule2']),
          tarballPresent: false,
          unknownObjects: [],
        },
      ],
    ]),
    packageNames: new Set(['package1', 'package2']),
    packageMajorVersions: new Set(['package1@1.2.3', 'package2@1.2.3']),
    perLanguage: new Map([
      [
        'python',
        new Map([
          [
            Grain.PACKAGES,
            new Map([['package1', DocumentationStatus.MISSING]]),
          ],
        ]),
      ],
    ]),
  };

  // WHEN
  const serialized = serialize(state);
  const deserialized = deserialize(serialized);

  // THEN
  expect(serialized).toEqual(
    JSON.stringify(
      {
        continuationToken: 'token',
        indexedPackages: {
          _type: 'Map',
          value: [
            [
              'package1',
              {
                metadataPresent: true,
                assemblyPresent: true,
                uninstallable: false,
                submodules: {
                  _type: 'Set',
                  value: ['submodule1', 'submodule2'],
                },
                tarballPresent: false,
                unknownObjects: [],
              },
            ],
          ],
        },
        packageNames: {
          _type: 'Set',
          value: ['package1', 'package2'],
        },
        packageMajorVersions: {
          _type: 'Set',
          value: ['package1@1.2.3', 'package2@1.2.3'],
        },
        perLanguage: {
          _type: 'Map',
          value: [
            [
              'python',
              {
                _type: 'Map',
                value: [
                  [
                    'packages',
                    {
                      _type: 'Map',
                      value: [['package1', 'Missing']],
                    },
                  ],
                ],
              },
            ],
          ],
        },
      },
      null,
      2
    )
  );
  expect(state).toEqual(deserialized);
});
