import { Construct } from '@aws-cdk/core';
import { Foo } from './foo';
import { Hello } from './hello';

export class Dummy extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new Hello(this, 'Hello');
    new Foo(this, 'Foo');
  }
}