import { createHash } from 'crypto';
import { MathExpression, Metric } from '@aws-cdk/aws-cloudwatch';

/**
 * Creates a MathExpression on the current metric, applying the `FILL` function
 * to it. This is useful to turn a sparse metric into a continuous one.
 */
export function fillMetric(
  metric: Metric,
  value: number | 'REPEAT' = 0
): MathExpression {
  // We assume namespace + name is enough to uniquely identify a metric here.
  // This is true locally at this time, but in case this ever changes, consider
  // also processing dimensions and period.
  const h = createHash('sha256')
    .update(metric.namespace)
    .update('\0')
    .update(metric.metricName)
    .digest('hex');

  const metricName = `m${h}`;

  return new MathExpression({
    expression: `FILL(${metricName}, ${value})`,
    label: metric.label,
    usingMetrics: { [metricName]: metric },
  });
}
