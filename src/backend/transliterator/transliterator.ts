// undefined
import * as path from 'path';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';
import { Construct } from '@aws-cdk/core';

export interface TransliteratorProps extends Omit<ecs.ContainerDefinitionOptions, 'image'> {
  readonly taskDefinition: ecs.FargateTaskDefinition;
}

export class Transliterator extends ecs.ContainerDefinition {
  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id, {
      ...props,
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, 'transliterator.ecs-entrypoint.bundle')),
    });

    props.taskDefinition.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:SendTaskFailure',
        'states:SendTaskHeartbeat',
        'states:SendTaskSuccess',
      ],
      resources: ['*'],
    }));
  }
}