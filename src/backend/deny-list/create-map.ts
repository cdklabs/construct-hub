import { DenyListRule } from './api';
/**
 * Creates a map from a set of deny list rules and performs some verificatins.
 */
export function createDenyListMap(rules: DenyListRule[]): Record<string, DenyListRule> {
  const map: { [nameVersion: string]: DenyListRule } = {};
  for (const entry of rules) {
    const versionSuffix = entry.version ? `/v${entry.version}` : '';
    const key = `${entry.packageName}${versionSuffix}`;
    if (key in map) {
      throw new Error(`Duplicate deny list entry: ${key}`);
    }

    map[key] = entry;
  }

  // iterate over all rules that match all versions and check that there
  // are no version-specific rules that are considered duplicates.
  for (const rule of rules.filter(x => !x.version)) {
    // if there are any keys in `map` that match this package name (with a version), report them as duplicates.
    const matches = Object.keys(map).filter(key => key.startsWith(rule.packageName + '/'));
    if (matches.length > 0) {
      throw new Error(`Found rules that match specific versions of "${rule.packageName}" (${matches.map(m => m.split('/v')[1]).join(',')}) but there is also a rule that matches all versions`);
    }
  }

  return map;
}
