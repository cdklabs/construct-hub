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

## :fire: Disaster Recovery

### Storage Disaster

Every deployment of Construct Hub automatically allocates a failover bucket for every bucket it creates and uses.
The failover buckets are created with the exact same properites as the original buckets, but are not activated by default.
They exist in order for operators to perform scheduled snapshots of the original data, in preparation for a disater.

Construct Hub deployments provide CloudFormation outputs that list out the necessary commands you need to run in order to
create those snapshots, and backup your data into the failover buckets.

After construct hub deployment finishes, at the time of your choosing, locate those outputs in the CloudFormation console, under the "Outputs" tab, and run the commands:

```console
aws s3 sync s3://construct-hub-dev-constructhubdenylistbucket1b3c2-1n2loz0z3u2x4 s3://construct-hub-dev-constructhubdenylistfailoverbuc-hnxtur2i9smy
aws s3 sync s3://construct-hub-dev-constructhubingestionconfigbuck-lrjjt5rdbfnr s3://construct-hub-dev-constructhubingestionfailoverco-flcmkc25ra5e
aws s3 sync s3://construct-hub-dev-constructhublicenselistbucket93-1bdf207eys9et s3://construct-hub-dev-constructhublicenselistfailover-1jqfoba4mxfny
aws s3 sync s3://construct-hub-dev-constructhubpackagedatadc5ef35e-4lgmx5xe9nv2 s3://construct-hub-dev-constructhubfailoverpackagedata-qr2qge4kodvv
aws s3 sync s3://construct-hub-dev-constructhubsourcesnpmjsstaging-14eppmcw5vsr3 s3://construct-hub-dev-constructhubsourcesfailovernpmj-zc2sciapis06
aws s3 sync s3://construct-hub-dev-constructhubwebappwebsitebucket-49110nn5q2ro s3://construct-hub-dev-constructhubwebappfailoverwebsi-1o2u8fix6ujdi
```

> Its recommended you run these commands from within the AWS network, preferably in the same region as the deployment.

Once these commands finish, all your data will be backed up into the failover buckets, and you should be ready.
When storage related disaster strikes, simply activate the failover buckets:

```ts
new ConstructHub(this, 'ConstructHub', {
  failoverStorageActive: true,
  ...
}
```

And deploy this to your environment. This will swap out all the original buckets with the pre-populated failover buckets.
Note that any data that was indexed in construct hub post the creation of the snapshot, will not be available immediately once you perform the failover.
Construct hub will pick up discovery from the marker that was included in the last snapshot.

When you restore the original data and are ready to go back to the original buckets, simply remove this property and deploy again.

#### When NOT to use this procedure

If the data loss/corruption is self-inflicted and continuous, i.e construct hub misbehaves and mutates its own data in a faulty manner.
In this case switching to the failover won't help because the bad behavior will be applied on the failover buckets.

#### When to use this procedure.

This procedure is designed to be used as a reaction to a single and isolated corruption/loss event, either by human error or by the system.
**Its imperative you validate the corruption is not continuous!**

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
means that some packages could not be processed by the construct hub and therefore
they might be missing documentation for one or more languages, or may not be referenced
in the catalog at all.

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

For each language supported by the Construct Hub, there should be an entry under
the `DocGen` array. If the `error` field has a value or an empty object (`{}`) it
means that this specific language failed. If the information under `error` is
not sufficient, a deeper dive into the execution logs of the specific doc gen
task is required.

To see the execution logs of a specific task, locate the step function execution
by clicking the *State Machine* button in the backend dashboard, and
search for the execution named at `$TaskExecution.Name`.

Open the execution details and locate the failed tasks. Failed tasks are colored
orange or red in the state diagram.

Reviewing the logs of various tasks can be useful to obtain more information. Tasks
are retried automatically by the state machine, so it might be useful to review
a few failures to identify if an error is endemic or transient.

Click on the URL under **Resource** in the **Details** tab in order to jump to the
AWS console for this specific task execution and view logs from there.

In the case of ECS tasks, the CloudWatch logs for a particular execution can be
found by following the links from the state machine execution events to the ECS
task, then to the CloudWatch Logs stream for that execution.

> In case ECS says "We couldn't find the requested content.", it means that the task
> execution was already deleted from ECS, and then you should be able to go directly to the CloudWatch
> logs for this task. see [Diving into ECS logs in CloudWatch][#ecs-log-dive]
> section for details on how to find the CloudWatch logs for this task based on the task ID.

For *Lambda* tasks, the request ID can be obtained from the corresponding
`TaskSucceeded` or `TaskFailed` event in the state machine execution trace,
which can be searched for in the Lambda function's CloudWatch Logs.

> For additional recommendations for diving into CloudWatch Logs, refer to the
> [Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

Once the root cause has been identified and fixed (unless this was a transient
issue), messages from the dead-letter queue can be sent back to the State
Machine for re-processing by running the *Redrive DLQ* function, linked from the
*Orchestration* section of the backend dashboard.

If messages are sent back to the dead-letter queue, perform the investigation
steps again.


### `ConstructHub/Orchestration/CatalogBuilder/ShrinkingCatalog`

#### Description

This alarm goes off if the count of entries in the `catalog.json` object, which
backs the search experience of ConstructHub, reduces by more than 5 items,
meaning packages are no longer accessible for search.

#### Investigation

Packages can be removed from `catalog.json` in normal circumstances: when a
package is added the the deny-list of the deployment, it will eventually be
pruned from the catalog. If many packages are added to the deny-list at the same
time, this alarm might go off.

Review the CloudWatch metric associated to the alarm to understand if the
magnitude of the catalog size change corresponds to a known or expected event.
If the change corresponds to an expected event (i.e: due to a change in
deny-list contents), you can treat the alarm as a false positive.

On the other hand, if the catalog contraction is unexpected, investigate the
logs of the *Catalog Builder* function to identify any unexpected activity.

#### Resolution

The *package data bucket* is configured with object versioning. You can
identify a previous "good" version of the `catalog.json` object by reviewing the
object history in the S3 console (or using the AWS CLI or SDK). The number of
elements in the `catalog.json` is reported in a metadata attribute of the object
in S3 - which can help identify the correct previous version without necessarily
having to download all of them for inspection.

When the relevant version has been identified, it can be restored
using the following AWS CLI command (replace `<bucket-name>` with the
relevant *package data bucket* name, and `<version-id>` with the S3 version ID
you have selected):

```console
$ aws s3api copy-object                                               \
  --bucket='<bucket-name>'                                            \
  --copy-source='<bucket-name>/catalog.json?versionId=<version-id>'   \
  --key='catalog.json'
```

This will produce an output similar to the following (note that the `VersionId`
value there is the **new** current version of  the `catalog.json` object, which
will always be different from the version ID you copied from):

```json
{
  "CopyObjectResult": {
    "LastModified": "2015-11-10T01:07:25.000Z",
    "ETag": "\"589c8b79c230a6ecd5a7e1d040a9a030\""
  },
  "VersionId": "YdnYvTCVDqRRFA.NFJjy36p0hxifMlkA"
}
```


### `ConstructHub/Orchestration/Resource/ExecutionsFailed`

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

#### Description

One instance of this alarms exists for each configured CodeArtifact source. It
triggers when CodeArtifact events (via EventBridge) failed processing through
the *Forwarder Function* enough times to make it to the dead-letter queue. Those
events have not been notified to the ingestion queue and the packages that
triggered them are not ingested.

> :warning: Messages in the dead-letter queue can only be persisted there for up
> to **14 days**. If a problem cannot be investigated and resolved within this
> time frame, it is recommended to copy those messages out to persistent storage
> for later re-processing.

#### Investigation

Locate the relevant CodeArtifact package source in the backend dashboard, and
click the *DLQ* button to access the dead-letter queue. Messages in the queue
have attributes providing information about the last failure that happened
before they were sent to the dead-letter queue.

If that information is not sufficient to understand the problem, click the
*Search Log Group* to dive into the function's logs in CloudWatch Logs.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

Once the root cause has been fixed, messages from the dead-letter queue need to
be sent back to the *Forwarder Function* for processing. Messages from the
dead-letter queue need to be manually passed to new function invocations.

> :construction: An automated way to replay messages from the dead-letter queue
> will be provided in the future.


### `ConstructHub/Sources/CodeArtifact/*/Fowarder/Failures`

#### Description

One instance of this alarms exists for each configured CodeArtifact source. It
triggers when CodeArtifact events (via EventBridge) fail processing through the
*Forwarder Function*, which filters messages and notifies the ingestion queue
when appropriate. This means newly published packages from the CodeArtifact
repository are not ingested anymore.

#### Investigation

Locate the relevant CodeArtifact package source in the backend dashboard, and
click the *Search Log Group* button to dive into the logs of the forwarder
function.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

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

### `ConstructHub/Sources/NpmJs/Follower/NoChanges`

#### Description

This alarm is only provisioned when the `NpmJs` package source is configured. It
triggers when the function has not registered any changes from the npmjs.com
registry in 10 minutes.

#### Investigation

The *NpmJs Follower* tracks changes from the CouchDB replica at
`replicate.npmjs.com/registry`, and uses the `seq` properties to determine what
changes have already been processed.

Occasionally, the replica instance will be replaced, and the sequence numbers
will be reset by this action. The *NpmJs Follower* detects this condition and
rolls back automatically in this case, so this should not trigger this alarm.

Look at `npmjs.com` status updates and announcements. This alarm may go off in
case a major outage prevents `npmjs.com` from accepting new package version for
more than 10 minutes. There is nothing you can do in this case.

If this has not happened, review the logs of the *NpmJs Follower* to identify
any problem.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

The alarm will automatically go back to green once the Lambda function starts
reporting `npmjs.com` registry changes again. No further action is needed.

### `ConstructHub/Sources/NpmJs/Stager/DLQNotEmpty`

#### Description

This alarm is only provisioned when the `NpmJs` package source is configured. It
triggers when the stager function has failed processing an input message 3 times
in a row, which resulted in that message being sent to the dead-letter queue.

The package versions that were targeted by those messages have hence not been
ingested into ConstructHub.

#### Investigation

The *NpmJs Stager* receives messages from the *NpmJs Follower* function for each
new package version identified. It downloads the npm package tarball, stores it
into a staging S3 bucket, then notifies the ConstructHub *Ingestion queue* so
the package version is indexed into ConstructHub.

An `npmjs.com` outage could result in failures to download the tarballs, so
start by checking the `npmjs.com` status updates and announcements.

Additionally, review the logs of the *NpmJs Stager* function to identify any
problem.

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

Once the root cause of the failures has been addressed, the messgaes from the
dead-letter queue can be automatically re-processed through the Lambda function
by enabling the SQS Trigger that is automatically configured on the function,
but is disabled by default.

Once all messages have cleared from the dead-letter queue, do not forget to
disable the SQS Trigger again.

--------------------------------------------------------------------------------

## :repeat: Bulk Re-processing

In some cases, it might be useful to re-process indexed packages though parts or
all of the back-end. This section descripts the options offered by the back-end
system and when it is appropriate to use them.

### Overview

Two workflows are available for bulk-reprocessing:

1. The "re-ingest everything" workflow can be used to re-process packages
   through the entire pipeline, including re-generating the `metadata.json`
   object. This is usually not necessary, unless an issue has been identified
   with many indexed packages (incorrect or missing `metadata.json`, incorrectly
   identfied construct framework package, etc...). In most cases, re-generating
   the documentation is sufficient.
1. The "re-generate all documentation" workflow re-runs all indexed packages
   through the documentation-generation process. This is useful when a new
   language is added to ConstructHub, or the rendered documentation has
   significantly changed, as it will guarantee all packages are on the latest
   version of it.

### Usage

In the AWS Console, navigate to the StepFunctions console, and identify the
ConstructHub workflows. Simply initiate a new execution of the workflow of your
choice - the input payload is not relevant, and we recommend setting it to an
object such as the following:

```json
{
  "requester": "your-username",
  "reason": "A short comment explaining why this workflow was ran"
}
```

These informations may be useful to other operations as they observe the side
effects of executing these workflows.

--------------------------------------------------------------------------------

### `ConstructHub/Sources/NpmJs/Canary/SLA-Breached`

#### Description

This alarm is only provisioned in case the [NpmJs package canary][package-canary]
was configured. It triggers when the canary detects that a recently published
package version (by default, the tracked package is `construct-hub-probe`) was
not discovered and indexed within the predefined SLA period (by default, `5`
minutes). This means the hub might not be discovering new packages versions.

The alarm will persist as long as any tracked version of the probe package is
still missing from the ConstructHub instance past the configured SLA, or if the
latest version was ingested out-of-SLA.

[package-canary]: ../README.md#discovery-canary)

#### Investigation

If the alarm went off due to insufficient data, the canary might not be emitting
metrics properly. In this case, start by ensuring the lambda function that
implements the canary is executing as intended. It is normally scheduled to run
every minute, but might have been unable to execute, for example, if your
account ran out of Lambda concurrent executions for a while. The Lambda function
can be found in the Lambda console: its description contains
`Sources/NpmJs/PackageCanary`. If the function runs as intended,
[dive into the Lambda logs][#lambda-log-dive] to understand why it might be
unable to evaluate the metric.

Otherwise, look for traces of the package version in the logs of each step in
the pipeline:
- The NpmJs follower function
- The NpmJs stager function
- The backend orchestration workflow
- The Doc-Gen ECS task logs
- The catalog builder

For additional recommendations for diving into CloudWatch Logs, refer to the
[Diving into Lambda Function logs in CloudWatch Logs][#lambda-log-dive] section.

#### Resolution

The alarm will automatically go back to green once all outstanding versions of
the configured canary package are available in the ConstructHub instance, and
the latest revision thereof is within SLA.

If there is a reason why a tracked version cannot possibly be ingested, the S3
object backing the canary state can be deleted, which will effectively
re-initialize the canary to track only the latest available version.

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

### Diving into ECS logs in CloudWatch Logs
[#ecs-log-dive]: #diving-into-ecs-logs-in-cloudwatch-logs

ECS tasks emit logs into CloudWatch under a log group called
`ConstructHubOrchestrationTransliteratorLogGroup`
in its name and the log stream `transliterator/Resource/$TASKID` (e.g.
`transliterator/Resource/6b5c48f0a7624396899c6a3c8474d5c7`).
