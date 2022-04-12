import { ConcreteWidget } from '@aws-cdk/aws-cloudwatch';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { IFunction } from '@aws-cdk/aws-lambda';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct, Tags } from '@aws-cdk/core';
import { gravitonLambdaIfAvailable } from '../backend/_lambda-architecture';
import { SqsDlqStatsWidgetFunction } from './sqs-dlq-stats-widget-function';

type QueueWidgetDetails = {
  name: string;
  queue: IQueue;
  reDriveFunction?: IFunction;
};

export interface SQLDLQWidgetProps {
  readonly queues: QueueWidgetDetails[];
  readonly key: string;
  readonly description?: string;
  readonly emptyQueueMessage?: string;
  readonly nonEmptyQueueMessage?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * CloudWatch dashboard widget to show the list of DLQs which have messages
 * When the queue has message(s), the widget will generate a link to goto the queue
 * and if there is a re-drive lambda, the widget will include a button to
 * execute the re-drive lambda
 */
export class SQSDLQWidget extends ConcreteWidget {
  private readonly handler: SqsDlqStatsWidgetFunction;
  private readonly queues: Record<string, QueueWidgetDetails> = {};
  private readonly description: string;
  private readonly title: string;
  private readonly emptyQueueMessage: string;
  private readonly nonEmptyQueueMessage: string;

  public constructor(scope: Construct, id: string, props: SQLDLQWidgetProps) {
    super(props.width ?? 12, props.height ?? 8);

    this.title = props.title ?? 'SQS DLQ';
    this.description = props.description ?? '';
    this.emptyQueueMessage = props.emptyQueueMessage ?? 'There are no messages in the DLQs. This is normal and no action is required.';
    this.nonEmptyQueueMessage = props.nonEmptyQueueMessage ?? 'There are some message in the DLQ. The table below lists the queues with non-empty DLQs. Please check the DLQs and re-drive the messages. Once the messages are re-driven, check the queue again as the metrics takes time to updated.';

    this.handler = new SqsDlqStatsWidgetFunction(scope, id, {
      architecture: gravitonLambdaIfAvailable(scope),
      description: '[ConstructHub/SQSDLQWidget] Is a custom CloudWatch widget handler',
    });
    // The handler is a SingletonFunction, so the actual Function resource is
    // not in the construct's scope, instead it's in the Stack scope. We must
    // hence refer to the REAL function via a private property (UGLY!).

    Tags.of((this.handler as any).lambdaFunction).add('function-purpose', 'cloudwatch-custom-widget');

    this.handler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudwatch:GetMetricData'],
      resources: ['*'],
    }));
  }

  public addQueue(name: string, queue: IQueue, reDriveFunction?: IFunction) {
    this.queues[name] = {
      name,
      queue,
      reDriveFunction,
    };
  }

  public toJson() {
    return [{
      type: 'custom',
      width: this.width,
      height: this.height,
      x: this.x,
      y: this.y,
      properties: {
        endpoint: this.handler.functionArn,
        params: {
          description: this.description,
          title: this.title,
          emptyQueueMessage: this.emptyQueueMessage,
          nonEmptyQueueMessage: this.nonEmptyQueueMessage,
          queues: Object.values(this.queues).reduce((acc, q) => {
            const queueName = q.queue.queueName;
            const fnArn = q.reDriveFunction?.functionArn;
            acc[queueName] = {
              name: q.name,
              queueName: queueName,
              reDriveFunctionArn: fnArn ?? undefined,
            };
            return acc;
          }, {} as Record<string, any>),
        },
        title: this.title,
        updateOn: {
          refresh: true,
          resize: false,
          timeRange: false,
        },
      },
    }];
  }
}
