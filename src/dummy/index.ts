import { Construct } from '@aws-cdk/core';
import { Monitoring } from '../monitoring';
import { Foo } from './foo';
import { Hello } from './hello';

export interface DummyProps {
  readonly monitoring: Monitoring;
}

export class Dummy extends Construct {
  constructor(scope: Construct, id: string, props: DummyProps) {
    super(scope, id);

    const hello = new Hello(this, 'Hello');
    const foo = new Foo(this, 'Foo');

    props.monitoring.watchful.watchLambdaFunction('Hello Function', hello);
    props.monitoring.watchful.watchLambdaFunction('Foo Function', foo);
  }
}