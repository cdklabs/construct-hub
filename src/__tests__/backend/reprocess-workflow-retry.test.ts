import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ConstructHub } from '../../construct-hub';

const dummyAlarmAction = {
  highSeverity:
    'arn:aws:sns:us-east-1:123456789012:mystack-mytopic-NZJ5JSMVGFIE',
};

/**
 * Reconstruct a Step Functions `DefinitionString` (which CloudFormation emits
 * as an `Fn::Join` interleaving static JSON with resolved tokens) back into a
 * parseable JSON object. Tokens (Ref / Fn::GetAtt / etc.) are substituted with
 * a harmless placeholder string; every token in an ASL definition is emitted
 * inside a JSON string value, so this always yields valid JSON.
 */
function parseDefinition(definitionString: any): any {
  let joined: string;
  if (typeof definitionString === 'string') {
    joined = definitionString;
  } else if (definitionString?.['Fn::Join']) {
    const [sep, parts] = definitionString['Fn::Join'] as [string, any[]];
    joined = parts
      .map((part) => (typeof part === 'string' ? part : 'TOKEN'))
      .join(sep);
  } else {
    throw new Error(
      `Unexpected DefinitionString shape: ${JSON.stringify(definitionString)}`
    );
  }
  return JSON.parse(joined);
}

/** Recursively collect every state object across nested Map/Parallel states. */
function collectStates(states: Record<string, any>): any[] {
  const collected: any[] = [];
  for (const state of Object.values(states ?? {})) {
    collected.push(state);
    if (state.Iterator?.States) {
      collected.push(...collectStates(state.Iterator.States));
    }
    if (state.ItemProcessor?.States) {
      collected.push(...collectStates(state.ItemProcessor.States));
    }
    for (const branch of state.Branches ?? []) {
      collected.push(...collectStates(branch.States));
    }
  }
  return collected;
}

test('all S3.ListObjectsV2 states retry S3.S3Exception (S3 503 SlowDown)', () => {
  const app = new App();
  const stack = new Stack(app, 'Test');
  new ConstructHub(stack, 'ConstructHub', {
    alarmActions: dummyAlarmAction,
  });

  const stateMachines = Template.fromStack(stack).findResources(
    'AWS::StepFunctions::StateMachine'
  );

  const listObjectsStates: any[] = [];
  for (const resource of Object.values(stateMachines)) {
    const definition = parseDefinition(resource.Properties.DefinitionString);
    for (const state of collectStates(definition.States)) {
      if (
        state.Type === 'Task' &&
        typeof state.Resource === 'string' &&
        state.Resource.includes('listObjectsV2')
      ) {
        listObjectsStates.push(state);
      }
    }
  }

  // Sanity: the ingestion ReprocessWorkflow (MaxKeys ladder) and the
  // orchestration RegenerateAllDocumentation states must all be present.
  expect(listObjectsStates.length).toBeGreaterThanOrEqual(20);

  for (const state of listObjectsStates) {
    expect(state.Retry).toBeDefined();
    const retryErrors = (state.Retry as any[]).flatMap(
      (retry) => retry.ErrorEquals as string[]
    );
    // The regression: S3 503 SlowDown surfaces as S3.S3Exception, which was
    // previously not retried, causing terminal failures on the first throttle.
    expect(retryErrors).toContain('S3.S3Exception');
    expect(retryErrors).toContain('S3.SdkClientException');

    // Must NOT swallow the DataLimitExceeded catch used to walk the ladder.
    expect(retryErrors).not.toContain('States.ALL');
    expect(retryErrors).not.toContain('States.TaskFailed');
  }
});
