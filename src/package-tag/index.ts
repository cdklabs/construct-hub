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
export interface ConditionConfig {
  readonly type: TagConditionLogicType | TagConditionPredicateType;
  readonly key?: string[];
  readonly value?: string;
  readonly children?: ConditionConfig[];
}

/**
 * Serialized tag declaration to be passed to lambdas via environment
 * variables.
 */
export interface PackageTag {
  readonly label: string;
  readonly color?: string;
  readonly condition: ConditionConfig;
}

/**
 * Condition for applying a custom tag to a package.
 */
export abstract class TagCondition {
  static and(...conds: TagCondition[]): TagCondition {
    return new TagConditionLogic(TagConditionLogicType.AND, conds);
  }

  static or(...conds: TagCondition[]): TagCondition {
    return new TagConditionLogic(TagConditionLogicType.OR, conds);
  }

  static not(...conds: TagCondition[]): TagCondition {
    return new TagConditionLogic(TagConditionLogicType.NOT, conds);
  }

  static eqls(key: string[], value: any): TagCondition {
    return new TagConditionPredicate(TagConditionPredicateType.EQUALS, key, value);
  }

  public abstract readonly type: TagConditionLogicType | TagConditionPredicateType;

  public abstract bind(): ConditionConfig;
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

  public bind(): ConditionConfig {
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

  public bind(): ConditionConfig {
    return {
      type: this.type,
      key: this.key,
      value: this.value,
    };
  }
}
