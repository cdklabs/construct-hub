export interface FilterTypeValue {
  readonly type: 'checkbox' | 'radio';
}

export abstract class FilterType {
  static checkbox(): FilterType {
    return new FilterTypeCheckbox();
  }

  static radio(): FilterType {
    return new FilterTypeRadio();
  }

  public abstract bind(): FilterTypeValue;
}

class FilterTypeRadio extends FilterType {
  public bind(): FilterTypeValue {
    return { type: 'radio' };
  }
}

class FilterTypeCheckbox extends FilterType {
  public bind(): FilterTypeValue {
    return { type: 'checkbox' };
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
  readonly filterType?: FilterType;
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
    this.filterType = (props?.filterType ?? FilterType.checkbox()).bind().type;
  }

  public bind(): PackageTagGroupConfig {
    return {
      id: this.id,
      label: this.label,
      tooltip: this.tooltip,
      filterType: this.filterType,
    };
  }
}
