## General Errors

### `Forbidden: null`

Usually, "Forbidden" with no additional details comes when you attempt to read
S3 objects that are SSE-encrypted, but you don't have permissions to decrypt
using the KMS key that encrypted the object; or when you attempt to read an
object from S3 that does not exist, or when you simply don't have the
appropriate IAM permissions for.

If you see this error, try checking that IAM permissions are configured
correctly for the respective backend component (including policies on VPC
resources if Construct Hub is running in a VPC, etc.).

## Transliteration Task Errors

### Running Out of File Descriptors (`ENOFILE`)

The Transliterator task in particular has been susceptible to running out of
file descriptors in the past, making the task extremely slow, or causing it to
fail or time out (sending the StepFunctions heart beat requires opening a
network connection, which requires at least 1 available file descriptor).

In order to determine where file descriptors are going, tasks can be configured
to have `lsof` run on each heartbeat tick, which will display the list of all
open files to `STDOUT`, which will be visible in the task's log.

To enable this feature, the task input must contain an
`env.RUN_LSOF_ON_HEARTBEAT` key with a string value (the value is arbitrary, but
must be truthy for Javascript - so non-empty - for the logging to be enabled).

In the case of the Transliterator task, the command includes the entire state
machine's input object, so one can simply re-run the state machine after having
merged the following into the state machine input object:

```json
{
  "env": {
    "RUN_LSOF_ON_HEARTBEAT": "YES"
  }
}
```

### Missing Files

Esbuild bundling does not allow dynamically requiring dependencies. As an example,
the following code snippet is incompatible with esbuild's bundling:

```ts
require('./commands').forEach(function (command) { 
  require('./src/' + command);
});
```

In one instance, a dependency upgrade introduced a new dependency that was performing
a dynamic require. By default, the dynamic require error in esbuild is suppressed.
As a result, the bundle used in the Transliterator task was missing files and was
failing on start-up.

If you see Transliterator task failures where the stack trace points to missing files,
this may be a result of a dynamic require being used. It is recommended that you
look at any dependency upgrades and whether they introduced a new dependency that
might be using a dynamic require.
