import { ConditionConfig, TagConditionLogicType, TagConditionPredicateType } from '../../package-tag';

/**
 * Checks whether a tag's condition applies to a package by computing declared
 * logic and running against the package.json. Recursively constructs chains of
 * `&&` and `||` conditions to allow arbitrary combinations.
 */
export function isTagApplicable(config: ConditionConfig, pkg: object): boolean {
  if (config.type === TagConditionLogicType.AND) {
    return (
      config.children?.reduce(
        (accum: boolean, cond) => accum && isTagApplicable(cond, pkg),
        true,
      ) ?? true
    );

  } else if (config.type === TagConditionLogicType.OR) {
    return (
      config.children?.reduce(
        (accum: boolean, cond) => accum || isTagApplicable(cond, pkg),
        false,
      ) ?? true
    );

  } else if (config.type === TagConditionLogicType.NOT) {
    const cond = config.children?.[0];

    if (!cond) {
      throw new Error('NOT logical operator requires a single condition');
    }

    return !isTagApplicable(cond, pkg);

  } else if (config.type === TagConditionPredicateType.EQUALS) {
    const val = config.key?.reduce(
      (accum: any, key) => (accum ? accum[key] : undefined),
      pkg,
    );
    return val === config.value;
  }

  return false;
}
