import { Architecture } from '@aws-cdk/aws-lambda';
import { Stack, Construct } from '@aws-cdk/core';

const REGIONS_WITH_GRAVITON_LAMBDA = new Set([
  'us-east-1',
  'us-east-2',
  'us-west-2',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
]);

/**
 * Returns the Graviton Lambda architecture (`Architecture.ARM`) if it's
 * available in the current region. This falls back to default in case the
 * region is not known at synthesis time.
 *
 * @param scope the scope from which the region should be extracted.
 */
export function gravitonLambdaIfAvailable(scope: Construct): Architecture | undefined {
  return REGIONS_WITH_GRAVITON_LAMBDA.has(Stack.of(scope).region)
    ? Architecture.ARM_64
    : undefined;
}
