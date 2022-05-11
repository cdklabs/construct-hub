import { Tags, Duration } from 'aws-cdk-lib';
import { ConcreteWidget } from 'aws-cdk-lib/aws-cloudwatch';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { gravitonLambdaIfAvailable } from '../_lambda-architecture';
import { PackageVersionsTableWidgetFunction } from './package-versions-table-widget-function';

export interface PackageVersionsTableWidgetProps {
  readonly bucket: IBucket;
  readonly key: string;
  readonly description?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
}

export class PackageVersionsTableWidget extends ConcreteWidget {
  private readonly handler: PackageVersionsTableWidgetFunction;
  private readonly key: string;
  private readonly description?: string;
  private readonly title?: string;

  public constructor(
    scope: Construct,
    id: string,
    props: PackageVersionsTableWidgetProps
  ) {
    super(props.width ?? 6, props.height ?? 6);

    this.handler = new PackageVersionsTableWidgetFunction(scope, id, {
      architecture: gravitonLambdaIfAvailable(scope),
      description:
        '[ConstructHub/MissingDocumentationWidget] Is a custom CloudWatch widget handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        OBJECT_KEY: props.key,
      },
      memorySize: 1_024,
      timeout: Duration.seconds(15),
    });
    // The handler is a SingletonFunction, so the actual Function resource is
    // not in the construct's scope, instead it's in the Stack scope. We must
    // hence refer to the REAL function via a private property (UGLY!).
    Tags.of((this.handler as any).lambdaFunction).add(
      'function-purpose',
      'cloudwatch-custom-widget'
    );

    props.bucket.grantRead(this.handler, props.key);

    this.key = props.key;
    this.description = props.description;
    this.title = props.title;
  }

  public toJson() {
    return [
      {
        type: 'custom',
        width: this.width,
        height: this.height,
        x: this.x,
        y: this.y,
        properties: {
          endpoint: this.handler.functionArn,
          params: {
            key: this.key,
            description: `${this.description ?? ''}\n`,
          },
          title: this.title,
          updateOn: {
            refresh: true,
            resize: false,
            timeRange: false,
          },
        },
      },
    ];
  }
}
