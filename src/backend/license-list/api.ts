import type * as lambda from '@aws-cdk/aws-lambda';

export interface ILicenseList {
  /**
   * Grants an AWS Lambda function permissions to read the license allow list,
   * and adds the relevant environment variables expected by the
   * `LicenseListClient`.
   */
  grantRead(handler: lambda.Function): void;
}
