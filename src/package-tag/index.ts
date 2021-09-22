interface PackageTagBase {
  /**
   * The label for the tag being applied
   */
  readonly label: string;

  /**
   * The hex value string for the color of the tag when displayed
   */
  readonly color?: string;
}

/**
 * Configuration for applying custom tags to relevant packages. Custom tags are
 * displayed on the package details page, and can be used for searching.
 */
export interface PackageTagConfig extends PackageTagBase {
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
export interface PackageTag extends PackageTagBase{
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
   * Target a field within the `package.json` to assert against. Nested fields
   * can be accessed by passing multiple keys.
   * `TagCondition.field('key1', 'key2')` will access
   * `packageJson?.field1?.field2`.
   */
  static field(...keys: string[]): TagConditionField {
    return new TagConditionField(keys);
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
    private readonly type: TagConditionLogicType,
    private readonly children: TagCondition[],
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
    private readonly type: TagConditionPredicateType,
    private readonly key: string[],
    private readonly value: string,
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

/**
 * Target a field to use in logic to dictate whether a tag is relevant.
 */
export class TagConditionField {
  public constructor(private readonly field: string[]) {}

  /**
   * Create a === condition which applies if the specified field within the
   * package's package.json is equal to the passed value.
   */
  public eq(value: any): TagCondition {
    return new TagConditionPredicate(
      TagConditionPredicateType.EQUALS,
      this.field,
      value,
    );
  }
}
