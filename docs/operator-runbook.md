# Operator Runbook

> This document aims at helping operators navigate a ConstructHub deployment to
> diagnose (and where possible, solve) problems. The *table of contents* of this
> file should always allow an operator to directly jump to the relevant article.
> As much as possible, articles should be self-contained, to reduce the need for
> cross-referencing documents.

Most of the investigation instructions in this document refer to the *backend
dashboard* of ConstructHub. Operators should ensure this dashboard is always
readily available.

--------------------------------------------------------------------------------

## ConstructHub Alarms

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

#### Investigation

#### Resolution

### `ConstructHub/InventoryCanary/NotRunning`

#### Description

#### Investigation

#### Resolution

### `ConstructHub/Orchestration/DLQ/NotEmpty`

#### Description

> :warning: Messages in the dead-letter queue can only be persisted there for up
> to **14 days**. If a problem cannot be investigated and resolved within this
> time frame, it is recommended to copy those messages out to persistent storage
> for later re-processing.

#### Investigation

#### Resolution

### `ConstructHUb/Orchestration/Resource/ExecutionsFailed`

#### Description

#### Investigation

#### Resolution

### `ConstructHub/Sources/NpmJs/Follower/Failures`

#### Description

#### Investigation

#### Resolution

### `ConstructHub/Sources/NpmJs/Follower/NotRunning`

#### Description

#### Investigation

#### Resolution

--------------------------------------------------------------------------------

## Recommendations

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
