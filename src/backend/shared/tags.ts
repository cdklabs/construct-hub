import {
  TagConditionConfig,
  TagConditionIncludesOptions,
  TagConditionLogicType,
  TagConditionSource,
} from '../../package-tag';

/**
 * Extract value from tag condition source.
 */
function getNestedField(config: TagConditionConfig, artifacts: Artifacts) {
  switch (config?.source) {
    case TagConditionSource.PACKAGE_JSON:
      const path = config?.key;
      return path?.reduce(
        (accum: any, key) => (accum ? accum[key] : undefined),
        artifacts.pkg
      );
    case TagConditionSource.README:
      return artifacts.readme;
    default:
      throw new Error(
        `Unexpected TagConditionConfig source: "${config.source}"`
      );
  }
}

// Predicate function signatures
type combinator = (previous: boolean, next: boolean) => boolean;
type comparison = (field: any, value: any, options?: object) => boolean;

/**
 * Create a function that combines conditions using && or || logic.
 */
const createBoolCombinator =
  (combine: combinator, initial: boolean) =>
  (config: TagConditionConfig, artifacts: Artifacts) =>
    config?.children?.reduce(
      (accum: boolean, cond) =>
        combine(accum, isTagApplicable(cond, artifacts)),
      initial
    ) ?? true;

/**
 * Create a function that checks nested value against predicate.
 */
const createFieldComparator =
  (compare: comparison) => (config: TagConditionConfig, artifacts: Artifacts) =>
    compare(getNestedField(config, artifacts), config?.value, config?.options);

/**
 * Negate and recurse for `not` functionality.
 */
const not = (config: TagConditionConfig, artifacts: Artifacts) => {
  const cond = config?.children?.[0];

  if (!cond) {
    throw new Error('NOT logical operator requires a single condition');
  }

  return !isTagApplicable(cond, artifacts);
};

type Artifacts = {
  pkg: object;
  readme: string;
};

type LogicMap = {
  [key in TagConditionLogicType]: (
    config: TagConditionConfig,
    artifacts: Artifacts
  ) => boolean;
};

const checkIncludes = (
  haystack: any,
  needle: any,
  options: TagConditionIncludesOptions = {}
): boolean => {
  const atLeast: number = options.atLeast ?? 1;
  const caseSensitive: boolean = options.caseSensitive ?? false;

  if (typeof haystack === 'string') {
    if (typeof needle !== 'string') {
      return false;
    }
    if (!caseSensitive) {
      needle = needle.toLowerCase();
      haystack = haystack.toLowerCase();
    }

    const matches = haystack.match(new RegExp(needle, 'g')) ?? [];
    return matches.length >= atLeast;
  }

  if (Array.isArray(haystack)) {
    let matches = 0;
    for (const item of haystack) {
      // TODO: add deep equality checking for comparing objects? ¯\_(ツ)_/¯
      if (item === needle) {
        matches += 1;
      }
    }
    return matches >= atLeast;
  }

  return false;
};

/**
 * Checks whether a tag's condition applies to a package by computing declared
 * logic and running against the package.json and README. Recursively constructs
 * chains of `&&` and `||` conditions to allow arbitrary combinations.
 */
export function isTagApplicable(
  config: TagConditionConfig,
  artifacts: Artifacts
): boolean {
  const fnMap: LogicMap = {
    [TagConditionLogicType.AND]: createBoolCombinator(
      (field, val) => field && val,
      true
    ),
    [TagConditionLogicType.OR]: createBoolCombinator(
      (field, val) => field || val,
      false
    ),
    [TagConditionLogicType.EQUALS]: createFieldComparator(
      (field, val) => field === val
    ),
    [TagConditionLogicType.INCLUDES]: createFieldComparator((field, val) =>
      checkIncludes(field, val, config.options)
    ),
    [TagConditionLogicType.STARTS_WITH]: createFieldComparator((field, val) =>
      field.startsWith(val)
    ),
    [TagConditionLogicType.NOT]: not,
  };
  const fn = fnMap[config.type] ?? (() => false);
  return fn(config, artifacts);
}
