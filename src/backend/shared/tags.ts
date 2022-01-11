import { TagConditionConfig, TagConditionLogicType } from '../../package-tag';

/**
 * Extract value at nested key from JSON object
 */
function getNestedField(path: string[] | undefined, pkg: object, _readme: string) {
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
  (config: TagConditionConfig, pkg: object, readme: string) =>
    config?.children?.reduce(
      (accum: boolean, cond) => combine(accum, isTagApplicable(cond, pkg, readme)),
      initial,
    ) ?? true;

/**
 * Create a function that checks nested value against predicate.
 */
const createFieldComparator = (compare: comparison) =>
  (config: TagConditionConfig, pkg: object, readme: string) =>
    compare(getNestedField(config?.key, pkg, readme), config?.value);

/**
 * Negate and recurse for `not` functionality.
 */
const not = (config: TagConditionConfig, pkg: object, readme: string) => {
  const cond = config?.children?.[0];

  if (!cond) {
    throw new Error('NOT logical operator requires a single condition');
  }

  return !isTagApplicable(cond, pkg, readme);
};

const readmeIncludes = (config: TagConditionConfig, _pkg: object, readme: string) => {
  if (!config?.value) {
    throw new Error('README_INCLUDES operator requires a single value');
  }

  let keyword: string = config?.value;
  const options = config.options ?? {};
  const atLeast: number = options.atLeast ?? 1;
  const caseSensitive: boolean = options.caseSensitive ?? false;
  if (!caseSensitive) {
    keyword = keyword.toLowerCase();
    readme = readme.toLowerCase();
  }

  const matches = readme.match(new RegExp(keyword, 'g')) ?? [];
  return matches.length >= atLeast;
};

type LogicMap = {
  [key in TagConditionLogicType]: (config: TagConditionConfig, pkg: object, readme: string) => boolean;
};

/**
 * Checks whether a tag's condition applies to a package by computing declared
 * logic and running against the package.json and README. Recursively constructs
 * chains of `&&` and `||` conditions to allow arbitrary combinations.
 */
export function isTagApplicable(config: TagConditionConfig, pkg: object, readme: string): boolean {
  const fnMap: LogicMap = {
    [TagConditionLogicType.AND]: createBoolCombinator((field, val) => field && val, true),
    [TagConditionLogicType.OR]: createBoolCombinator((field, val) => field || val, false),
    [TagConditionLogicType.EQUALS]: createFieldComparator((field, val) => field === val),
    [TagConditionLogicType.INCLUDES]: createFieldComparator((field, val) => field.includes(val)),
    [TagConditionLogicType.STARTS_WITH]: createFieldComparator((field, val) => field.startsWith(val)),
    [TagConditionLogicType.README_INCLUDES]: readmeIncludes,
    [TagConditionLogicType.NOT]: not,
  };
  const fn = fnMap[config.type] ?? (() => false);
  return fn(config, pkg, readme);
}
