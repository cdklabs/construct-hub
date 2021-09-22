/**
 * Configuration for applying custom tags to relevant packages. Custom tags are
 * displayed on the package details page, and can be used for searching.
 */
export interface PackageTagConfig {
  /**
   * The label for the tag being applied
   */
  readonly label: string;

  /**
   * The hex value string for the color of the tag when displayed
   */
  readonly color?: string;

  /**
   * The description of the logic that dictates whether the
   * package has the tag applied.
   */
  readonly condition: TagCondition;
}

/**
 * Serialized config for a tag condition
 */
export interface TagConditionConfig {
  readonly type: TagConditionLogicType | TagConditionPredicateType;
  readonly key?: string[];
  readonly value?: string;
  readonly children?: TagConditionConfig[];
}

/**
 * Serialized tag declaration to be passed to lambdas via environment
 * variables.
 */
export interface PackageTag {
  readonly label: string;
  readonly color?: string;
  readonly condition: TagConditionConfig;
}

/**
 * Condition for applying a custom tag to a package.
 */
export abstract class TagCondition {
  /**
   * Create an && condition which applies only when all condition arguments are
   * true.
   */
  static and(...conds: TagCondition[]): TagCondition {
    return new TagConditionLogic(TagConditionLogicType.AND, conds);
  }

  /**
   * Create an || condition which applies if any of the condition arguments are
   * true.
   */
  static or(...conds: TagCondition[]): TagCondition {
    return new TagConditionLogic(TagConditionLogicType.OR, conds);
  }

  /**
   * Create a ! condition which applies if the condition argument is false
   */
  static not(...conds: TagCondition[]): TagCondition {
    return new TagConditionLogic(TagConditionLogicType.NOT, conds);
  }

  /**
   * Create a === condition which applies if the specified field within the
   * package's package.json is equal to the passed value. Nested fields can
   * accessed by passing multiple keys. `['key1', 'key2']` will access
   * `packageJson?.field1?.field2`.
   */
  static fieldEq(key: string[], value: any): TagCondition {
    return new TagConditionPredicate(TagConditionPredicateType.EQUALS, key, value);
  }

  public abstract bind(): TagConditionConfig;
}

/**
 * Logic operators for combining predicate logic
 */
export enum TagConditionLogicType {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
}

class TagConditionLogic extends TagCondition {
  public readonly isLogic = true;
  public constructor(
    public readonly type: TagConditionLogicType,
    public readonly children: TagCondition[],
  ) {
    super();
  }

  public bind(): TagConditionConfig {
    return {
      type: this.type,
      children: this.children.map(cond => cond.bind()),
    };
  }
}

/**
 * The type of logic used to predicate a tag's presence
 */
export enum TagConditionPredicateType {
  EQUALS = 'EQUALS',
}

class TagConditionPredicate extends TagCondition {
  public readonly isPredicate = true;
  public constructor(
    public readonly type: TagConditionPredicateType,
    public readonly key: string[],
    public readonly value: string,
  ) {
    super();
  }

  public bind(): TagConditionConfig {
    return {
      type: this.type,
      key: this.key,
      value: this.value,
    };
  }
}
