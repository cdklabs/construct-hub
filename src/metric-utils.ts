import { createHash } from 'crypto';
import { Token } from 'aws-cdk-lib';
import { MathExpression, Metric } from 'aws-cdk-lib/aws-cloudwatch';

/**
 * Creates a MathExpression on the current metric, applying the `FILL` function
 * to it. This is useful to turn a sparse metric into a continuous one.
 */
export function fillMetric(
  metric: Metric,
  value: number | 'REPEAT' = 0
): MathExpression {
  // Token dimensions (resource references) are left out: their string form
  // depends on construction order, so the id would not be stable.
  const dimensions = Object.entries(metric.dimensions ?? {})
    .filter(([, dimension]) => !Token.isUnresolved(dimension))
    .sort();
  const key = JSON.stringify([metric.namespace, metric.metricName, dimensions]);
  const metricName = `m${createHash('sha256').update(key).digest('hex')}`;

  return new MathExpression({
    expression: `FILL(${metricName}, ${value})`,
    label: metric.label,
    usingMetrics: { [metricName]: metric },
  });
}
