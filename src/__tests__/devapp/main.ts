import { App } from 'aws-cdk-lib';
import { DevStack } from './dev-stack';

const app = new App();
new DevStack(app, 'construct-hub-dev');
app.synth();
