import { App } from '@aws-cdk/core';
import { DevStack } from './dev-stack';

const app = new App();
new DevStack(app, 'construct-hub-dev');
app.synth();
