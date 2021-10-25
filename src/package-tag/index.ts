interface PackageTagPresentationBase {
  /**
   * The label for the tag being applied
   */
  readonly label: string;

  /**
   * The hex value string for the color of the tag when displayed
   */
  readonly color?: string;
}

export interface Keyword extends PackageTagPresentationBase {}

export interface Highlight extends PackageTagPresentationBase{
  /**
   * Icon displayed next to highlight on package card
   */
  readonly icon?: string;
}

export interface SearchFilter {
  /**
   * Name of group to include filter in
   */
  readonly name: string;
}

export interface PackageTagBase {
  /**
   * Configuration for higlighting tag on package card
   * @default don't highlight tag
   */
  readonly highlight?: Highlight;

  /**
   * Configuration for showing tag as keyword
   * @default don't show tag in keyword list
   */
  readonly keyword?: Keyword;

  /**
   * Configuration for showing tag as search filter
   * @default don't show tag in search filters
   */
  readonly searchFilter?: SearchFilter;
}

/**
 * Configuration for applying custom tags to relevant packages. Custom tags are
 * displayed on the package details page, and can be used for searching.
 */
export interface PackageTag extends PackageTagBase {
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
  readonly type: TagConditionLogicType;
  readonly key?: string[];
  readonly value?: string;
  readonly children?: TagConditionConfig[];
}

/**
 * Serialized tag declaration to be passed to lambdas via environment
 * variables.
 */
export interface PackageTagConfig extends PackageTagBase {
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
   * `packageJson?.key1?.key2`.
   */
  static field(...keys: string[]): TagConditionField {
    return new TagConditionField(keys);
  }

  public abstract bind(): TagConditionConfig;
}

/**
 * Logic operators for performing specific conditional logic.
 */
export enum TagConditionLogicType {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  EQUALS = 'EQUALS',
  INCLUDES = 'INCLUDES',
  STARTS_WITH = 'STARTS_WITH',
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

class TagConditionPredicate extends TagCondition {
  public readonly isPredicate = true;
  public constructor(
    private readonly type: TagConditionLogicType,
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
      TagConditionLogicType.EQUALS,
      this.field,
      value,
    );
  }

  /**
   * Create a `field.includes(value)` condition which applies if the specified
   * field within the package's package.json includes the value. This works for
   * arrays or strings.
   */
  public includes(value: any): TagCondition {
    return new TagConditionPredicate(
      TagConditionLogicType.INCLUDES,
      this.field,
      value,
    );
  }

  /**
   * Create a `field.startsWith(value)` condition which applies if the specified
   * field within the package's package.json begins with the value. This works
   * only for string values.
   */
  public startsWith(value: string): TagCondition {
    return new TagConditionPredicate(
      TagConditionLogicType.STARTS_WITH,
      this.field,
      value,
    );
  }
}
