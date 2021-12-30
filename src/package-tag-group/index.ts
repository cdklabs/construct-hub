export class FilterTypeValue {
  /**
   * Allows 'checkbox' or 'radio'
   */
  public readonly value: string;

  constructor(value: string) {
    if (['checkbox', 'radio'].includes(value)) {
      this.value = value;
    } else {
      console.warn(`Invalid value received for FilterTypeValue. Expected 'checkbox' or 'radio', received: ${value}`);
      this.value = 'checkbox';
    }
  }
}

export abstract class FilterType {
  static checkbox(): FilterTypeValue {
    return new FilterTypeValue('checkbox');
  }

  static radio(): FilterTypeValue {
    return new FilterTypeValue('radio');
  }
}

export interface PackageTagGroupProps {
  /**
   * Group label to display. Falls back to id if not provided
   */
  readonly label?: string;
  /**
   * Optional message to show within a tooltip next to the filter label
   */
  readonly tooltip?: string;
  /**
   * Allows to specify the group filter type. Defaults to checkbox if not specified
   */
  readonly filterType?: FilterTypeValue;
}

export interface PackageTagGroupConfig {
  readonly id: string;
  readonly label?: string;
  readonly tooltip?: string;
  readonly filterType?: string;
}

/**
 * Defines a custom package tag group
 */
export class PackageTagGroup {
  public readonly label?: string;
  public readonly tooltip?: string;
  public readonly filterType?: string;

  constructor(public readonly id: string, props?: PackageTagGroupProps) {
    this.label = props?.label;
    this.tooltip = props?.tooltip;
    this.filterType = (props?.filterType ?? FilterType.checkbox()).value;
  }

  public get values(): PackageTagGroupConfig {
    return {
      id: this.id,
      label: this.label,
      tooltip: this.tooltip,
      filterType: this.filterType,
    };
  }
}
