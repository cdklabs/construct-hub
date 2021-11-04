import { ConcreteWidget } from '@aws-cdk/aws-cloudwatch';
import { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Tags, Duration } from '@aws-cdk/core';
import { gravitonLambdaIfAvailable } from '../_lambda-architecture';
import { MISSING_DOCUMENTATION_KEY_PATTERN } from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';
import { MissingDocumentationWidgetFunction } from './missing-documentation-widget-function';

export interface MissingDocumentationWidgetProps {
  readonly bucket: IBucket;
  readonly language: DocumentationLanguage;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
}

export class MissingDocumentationWidget extends ConcreteWidget {
  private readonly handler: MissingDocumentationWidgetFunction;
  private readonly language: DocumentationLanguage;
  private readonly title?: string;

  public constructor(scope: Construct, id: string, props: MissingDocumentationWidgetProps) {
    super(props.width ?? 6, props.height ?? 6);

    this.handler = new MissingDocumentationWidgetFunction(scope, id, {
      architecture: gravitonLambdaIfAvailable(scope),
      description: '[ConstructHub/MissingDocumnetationWidget] Is a custom CloudWatch widget handler',
      environment: { BUCKET_NAME: props.bucket.bucketName },
      memorySize: 1_024,
      timeout: Duration.seconds(15),
    });
    Tags.of(this.handler).add('function-purpose', 'cloudwatch-custom-widget');

    props.bucket.grantRead(this.handler, MISSING_DOCUMENTATION_KEY_PATTERN);

    this.language = props.language;
    this.title = props.title;
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
          language: this.language.name,
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
