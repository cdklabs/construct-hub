import { createHash } from 'crypto';
import { MathExpression, Metric } from 'aws-cdk-lib/aws-cloudwatch';

/**
 * Creates a MathExpression on the current metric, applying the `FILL` function
 * to it. This is useful to turn a sparse metric into a continuous one.
 *
 * @param metric the metric to be filled.
 * @param value  the value to fill gaps with.
 * @param id     a discriminator, required when several metrics sharing the
 *               same namespace and name (e.g: the same metric for two
 *               different resources) are rendered in the same graph or alarm.
 */
export function fillMetric(
  metric: Metric,
  value: number | 'REPEAT' = 0,
  id?: string
): MathExpression {
  // We assume namespace + name (+ the optional discriminator) is enough to
  // uniquely identify a metric here. This is true locally at this time, but
  // in case this ever changes, consider also processing dimensions and
  // period. Note: dimensions usually contain unresolved CDK tokens, which
  // CANNOT be hashed deterministically!
  const h = createHash('sha256')
    .update(metric.namespace)
    .update('\0')
    .update(metric.metricName)
    .update('\0')
    .update(id ?? '')
    .digest('hex');

  const metricName = `m${h}`;

  return new MathExpression({
    expression: `FILL(${metricName}, ${value})`,
    label: metric.label,
    usingMetrics: { [metricName]: metric },
  });
}
