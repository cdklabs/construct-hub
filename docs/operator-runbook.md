# :safety_vest: Operator Runbook

> This document aims at helping operators navigate a ConstructHub deployment to
> diagnose (and where possible, solve) problems. The *table of contents* of this
> file should always allow an operator to directly jump to the relevant article.
> As much as possible, articles should be self-contained, to reduce the need for
> cross-referencing documents.

Most of the investigation instructions in this document refer to the *backend
dashboard* of ConstructHub. Operators should ensure this dashboard is always
readily available.

--------------------------------------------------------------------------------

## :rotating_light: ConstructHub Alarms

### `ConstructHub/Ingestion/DLQNotEmpty`

#### Description

This alarm goes off when the dead-letter queue for the ingestion function is not
empty. This means messages send by package sources to the ingestion SQS queue
have failed processing through the ingestion function.

> :warning: Messages in the dead-letter queue can only be persisted there for up
> to **14 days**. If a problem cannot be investigated and resolved within this
> time frame, it is recommended to copy those messages out to persistent storage
> for later re-processing.

#### Investigation

Under the *Ingestion Function* section of the backend dashboard. The dead-letter
queue can be accessed by clicking the `DLQ` button.

Messages in the dead-letter queue have attributes that can be used to determine
the cause of the failure. These can be inspected by going into the *Send and
Receive messages* panel of the SQS console.

If the message attributes were not sufficient to determine the failure cause,
the Lambda function logs can be searched using the  *Search Log Group* button
in the backend dashboard. Since messages are sent to the dead-letter queue only
after having caused the *Ingestion Function* to fail several times, the `Errors`
metric will have data points that can be used to narrow the time-frame of log
searches.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

Once the cause of the issue has been identified, and resolved (unless it was a
transient problem), messages from the dead-letter queue can be sent back for
processing into the *Ingestion Function* by going to the Lambda console using
the link in the backend dashboard, then browsing into *Configuration*, then
*Triggers*, and enabling the SQS trigger from the dead-letter queue (this
trigger is automatically configured by ConstructHub, but is disabled by
default). Once the dead-letter queue has cleared up, disable that trigger again.

> It is possible messages still fail processing, in which case they will remain
> in the dead-letter queue. If the queue is not cleared up after you have
> allowed sufficient time for all messages to be re-attempted, disable the
> trigger and resume investigating. There may be a second problem that was
> hidden by the original one.


### `ConstructHub/Ingestion/Failure`

#### Description

This alarm goes off when the *Ingestion Function* fails. This has higher
sensitivity than the `ConstructHub/Ingestion/DLQNotEmpty`, and may trigger
before messages make it to the dead-letter queue.

It may be indicative if a problem with the package sources (sending broken
messages to the ingestion queue), or of a general degradation of the
availability of dependencies of the *Ingestion Function*.

#### Investigation

The classical way of diagnosing Lambda Function failures is to dive into the
logs in CloudWatch Logs. Those can easily be found by looking under the
*Ingestion Function* section of the backend dashboard, then clocking the *Search
Log Group* button.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

The alarm will automatically go back to green once the Lambda function stops
failing.

Some of the ingestion queue messages may however have made it to the dead-letter
queue, and caused the
[`ConstructHub/Ingestion/DLQNotEmpty`](#constructhubingestiondlqnotempty) alarm
to go off.


### `ConstructHub/InventoryCanary/Failures`

#### Description

The *Inventory Canary* is failing. This means the graphs in the backend
dashboard under sections *Catalog Overview* and *Documentation Generation* may
not contain accurate data (or no data at all).

#### Investigation

The classical way of diagnosing Lambda Function failures is to dive into the
logs in CloudWatch Logs. Those can easily be found by looking under the
*Catalog Overview* section of the backend dashboard, then clocking the *Search
Canary Log Group* button.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

The alarm will automatically go back to green once the Lambda function stops
failing. No further action is needed.


### `ConstructHub/InventoryCanary/NotRunning`

#### Description

The *Inventory Canary* is not running. This function is scheduled to run every
`5 minutes`, and produces the CloudWatch metrics that back graphs under the
*Catalog Overview* and *Documentation Generation* sections of the backend
dashboard.

#### Investigation

The *Inventory Canary* is triggered by an EventBridge rule, which can be
reviewed in the Lambda console (accessed by clicking the *Inventory Canary*
button under the *Catalog Overview* title of the backend dashboard), under
*Configuration* then *Triggers*. Verify the EventBridge trigger exists (if not,
it may need to be manually re-created).

If the rule exists, but the function does not run, the most likely cause is that
your account has run out of Lambda concurrent executions. This will manifest as
`Throttles` being visible under the *Monitoring* then *Metrics* panel of the
Lambda console.

#### Resolution

If the issue is that the account as run out of Lambda concurrency, consider
filing for a quota increase with AWS Support. The
[AWS documentation][aws-quota-increase] provides more information about how to
request a quota increase.

The alarm will automatically go back to green once the Lambda function starts
running as scheduled again. No further action is needed.


### `ConstructHub/Orchestration/DLQ/NotEmpty`

#### Description

The dead-letter queue of the orchestration state machine is not empty. This
means some indexed packages are missing documentation for one or more languages,
or may not be referenced in the search catalog.

> :warning: Messages in the dead-letter queue can only be persisted there for up
> to **14 days**. If a problem cannot be investigated and resolved within this
> time frame, it is recommended to copy those messages out to persistent storage
> for later re-processing.

#### Investigation

The dead-letter queue can be accessed by clicking the *DLQ* button under the
*Orchestration* title of the backend dashboard. Messages in the queue include
information about the failure that caused the message to be placed here. They
include the following elements:

Key                          | Description
-----------------------------|--------------------------------------------------
`$TaskExecution`             | References to the StateMachine execution
`DocGen[].error`             | Error message returned by a DocGen task
`catalogBuilderOutput.error` | Error message returned by the catalog builder

The `error` keys can help identify the root cause of an issue without having to
look any further. However, sometimes they do not provide sufficient information.
In those cases, click the *State Machine* button in the backend console, and
search for the execution named at `$TaskExecution.Name`, and review the
execution trace of it.

Reviewing the logs of various tasks can be useful to obtain more information.
For *Lambda* tasks, the request ID can be obtained from the corresponding
`TaskSucceeded` or `TaskFailed` event in the state machine execution trace,
which can be searched for in the Lambda function's CloudWatch Logs.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

In the case of ECS tasks, the CloudWatch logs for a particular execution can be
found by following the links from the state machine execution events to the ECS
task, then to the CloudWatch Logs stream for that execution.

#### Resolution

Once the root cause has been identified and fixed (unless this was a transient
issue), messages from the dead-letter queue can be sent back to the State
Machine for re-processing by running the *Redrive DLQ* function, linked from the
*Orchestration* section of the backend dashboard.

If messages are sent back to the dead-letter queue, perform the investigation
steps again.


### `ConstructHUb/Orchestration/Resource/ExecutionsFailed`

#### Description

The orchestration state machine has failing executions. This means the workflow
has failed on an unexpected error.

This is often the sign there is a bug in the state machine specification, or
that some of the state machine's downstream dependencies are experiencing
degraded availability.

> :warning: Failed state machine executions may not have succeeded sending their
> input to the dead-letter queue.

#### Investigation

Review the failed state machine executions, which can be found after clicking
the *State Machine* button under *Orchestration* in the backend dashboard. You
may use the *Filter by status* dropdown list to isolate failed executions.
Review the execution trace, to find the `ExecutionFailed` event (at the very end
of the events list).

If relevant, file a [bug report][bug-report] to have the state machine
specification fixed.

[bug-report]: https://github.com/cdklabs/construct-hub/issues/new

#### Resolution

Failed state machines should be manually re-started using the StepFunctions
console.

### `ConstructHub/Sources/CodeArtifact/*/Fowarder/DLQNotEmpty`

# Description

One instance of this alarms exists for each configured CodeArtifact source. It
triggers when CodeArtifact events (via EventBridge) failed processing through
the *Forwarder Function* enough times to make it to the dead-letter queue. Those
events have not been notified to the ingestion queue and the packages that
triggered them are not ingested.

> :warning: Messages in the dead-letter queue can only be persisted there for up
> to **14 days**. If a problem cannot be investigated and resolved within this
> time frame, it is recommended to copy those messages out to persistent storage
> for later re-processing.

# Investigation

Locate the relevant CodeArtifact package source in the backend dashboard, and
click the *DLQ* button to access the dead-letter queue. Messages in the queue
have attributes providing information about the last failure that happened
before they were sent to the dead-letter queue.

If that information is not sufficient to understand the problem, click the
*Search Log Group* to dive into the function's logs in CloudWatch Logs.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

# Resolution

Once the root cause has been fixed, messages from the dead-letter queue need to
be sent back to the *Forwarder Function* for processing. Messages from the
dead-letter queue need to be manually passed to new function invocations.

> :construction: An automated way to replay messages from the dead-letter queue
> will be provided in the future.


### `ConstructHub/Sources/CodeArtifact/*/Fowarder/Failures`

# Description

One instance of this alarms exists for each configured CodeArtifact source. It
triggers when CodeArtifact events (via EventBridge) fail processing through the
*Forwarder Function*, which filters messages and notifies the ingestion queue
when appropriate. This means newly published packages from the CodeArtifact
repository are not ingested anymore.

# Investigation

Locate the relevant CodeArtifact package source in the backend dashboard, and
click the *Search Log Group* button to dive into the logs of the forwarder
function.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

# Resolution

This alarm will automatically go back to green as the CodeArtifact forwarder
stops failing.

Some messages may have been sent to the dead-letter queue, and caused the
[`ConstructHub/Sources/CodeArtifact/Fowarder/DLQNotEmpty`](#constructhubsourcescodeartifactfowarderdlqnotempty)
alarm to go off.


### `ConstructHub/Sources/NpmJs/Follower/Failures`

#### Description

This alarm is only provisioned when the `NpmJs` package source is configured. It
triggers when executions encounter failures, preventing new packages from
`npmjs.com` from being discovered and ingested.

#### Investigation

Click the *NpmJs Follower* button in the backend dashboard to reach the Lambda
console for this function. Under *Monitoring*, then *Logs*, you will find a list
of links to recent invocations, which is a great place to start for
understanding what happens. In most cases, only the latest invocation is
relevant.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

This alarm will automatically go back to green once the `NpmJs` follower stops
failing. No futher action is needed.


### `ConstructHub/Sources/NpmJs/Follower/NotRunning`

#### Description

This alarm is only provisioned when the `NpmJs` package source is configured. It
triggers when the function is not running at the scheduled rate (every
`5 minutes`). This means new packages published to `npmjs.com` are not
discovered and injested.

#### Investigation

The *NpmJs Follower* is triggered by an EventBridge rule, which can be
reviewed in the Lambda console (accessed by clicking the *NpmJs Follower*
button in the backend dashboard), under *Configuration* then *Triggers*. Verify
the EventBridge trigger exists (if not, it may need to be manually re-created).

If the rule exists, but the function does not run, the most likely cause is that
your account has run out of Lambda concurrent executions. This will manifest as
`Throttles` being visible under the *Monitoring* then *Metrics* panel of the
Lambda console.

#### Resolution

If the issue is that the account as run out of Lambda concurrency, consider
filing for a quota increase with AWS Support. The
[AWS documentation][aws-quota-increase] provides more information about how to
request a quota increase.

The alarm will automatically go back to green once the Lambda function starts
running as scheduled again. No further action is needed.

--------------------------------------------------------------------------------

## :information_source: General Recommendations

### Diving into Lambda Function logs in CloudWatch Logs
[#lambda-log-dive]: #diving-into-lambda-function-logs-in-cloudwatch-logs

Diving into Lambda Function logs can seem daunting at first. The following are
often good first steps to take in such investigations:

- If possible, narrow down the CloudWatch Logs Search time range around the
  event you are investigating. Try to keep the time range as narrow as possible,
  ideally less than one hour wide.
- Start by searching for `"ERROR"` - this will often yield interesting starting
  points.
- Once you've homed in on a log entry from a failed Lambda execution, identify
  the request ID for this trace.
  + Lambda log entries are formatted like so:
    `<timestamp> <request-id> <log-level> <message>`
  + Extract the `request-id` segment (it is a UUID), and copy it in the search
    bar, surrounded by double quotes (`"`)
- Remember, the search bar of CloudWatch Logs requires quoting if the searched
  string includes any character that is not alphanumeric or underscore.
- For more information on CloudWatch Log search patterns, refer to the
  [CloudWatch Logs documentation][cw-logs-search-patterns].

[cw-logs-search-patterns]:
  https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html#matching-terms-events

[aws-quota-increase]:
  https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html
