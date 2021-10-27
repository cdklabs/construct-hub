import { TagConditionConfig, TagConditionLogicType } from '../../package-tag';

/**
 * Extract value at nested key from JSON object
 */
function getNestedField(path: string[] | undefined, pkg: object) {
  return path?.reduce(
    (accum: any, key) => (accum ? accum[key] : undefined),
    pkg,
  );
}

// Predicate function signatures
type combinator = (previous: boolean, next: boolean) => boolean;
type comparison = (field: any, value: any) => boolean;

/**
 * Create a function that combines conditions using && or || logic.
 */
const createBoolCombinator = (combine: combinator, initial: boolean) =>
  (config: TagConditionConfig, pkg: object) =>
    config?.children?.reduce(
      (accum: boolean, cond) => combine(accum, isTagApplicable(cond, pkg)),
      initial,
    ) ?? true;

/**
 * Create a function that checks nested value against predicate.
 */
const createFieldComparator = (compare: comparison) =>
  (config: TagConditionConfig, pkg: object) =>
    compare(getNestedField(config?.key, pkg), config?.value);

/**
 * Negate and recurse for `not` functionality.
 */
const not = (config: TagConditionConfig, pkg: object) => {
  const cond = config?.children?.[0];

  if (!cond) {
    throw new Error('NOT logical operator requires a single condition');
  }

  return !isTagApplicable(cond, pkg);
};

type LogicMap = {
  [key in TagConditionLogicType]: (config: TagConditionConfig, pkg: object) => boolean;
};

/**
 * Checks whether a tag's condition applies to a package by computing declared
 * logic and running against the package.json. Recursively constructs chains of
 * `&&` and `||` conditions to allow arbitrary combinations.
 */
export function isTagApplicable(config: TagConditionConfig, pkg: object): boolean {
  const fnMap: LogicMap = {
    [TagConditionLogicType.AND]: createBoolCombinator((field, val) => field && val, true),
    [TagConditionLogicType.OR]: createBoolCombinator((field, val) => field || val, false),
    [TagConditionLogicType.EQUALS]: createFieldComparator((field, val) => field === val),
    [TagConditionLogicType.INCLUDES]: createFieldComparator((field, val) => field.includes(val)),
    [TagConditionLogicType.STARTS_WITH]: createFieldComparator((field, val) => field.startsWith(val)),
    [TagConditionLogicType.NOT]: not,
  };
  const fn = fnMap[config.type] ?? (() => false);
  return fn(config, pkg);
}
