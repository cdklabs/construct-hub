# Errors Encountered in the Past

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

## Deploy Errors

### `<Signals.SIGKILL: 9>`

A `SIGKILL` error is likely a memory issue with a Custom Resource AWS Lambda Function 
that is running during deployment. One such example is the Web App Deploy construct
that copies the Web App into an S3 Bucket using a Custom Resource. This is an AWS Lambda
Function that is subject to memory constraints.

If you see this error, you can confirm the underlying issue by diving into the Custom
Resource [lambda logs](operator-runbook#diving-into-lambda-function-logs-in-cloudwatch-logs), and increase the
memory constraint on the AWS Lambda Function.

## Transliteration Task Errors

### Running Out of File Descriptors (`ENOFILE`, `EMFILE: too many open files` or `EBUSY`)

Programs running in AWS Lambda Functions or Amazon ECS tasks have stricter restrictions on file system access than when running the same program locally.
In particular the Transliterator task is susceptible to making many file system calls.

If these file system calls are executed in parallel, it is possible the program will run out of file descriptors.
This surfaces as a `ENOFILE` or `EMFILE: too many open files` failure, but can also be the reason behind a less obvious error like `EBUSY`.

**Running Out of File Descriptors is not expected behavior.**
In most cases this indicates a code bug, not a misconfiguration.
Even though serverless systems are limited in their resources, the executed code must not exceed these limits or be able to appropriately react to these limitations.

The usual culprit are file system calls, executed in unbound parallelism and often dependant on the program input.
For example reading and writing a file for every example snippet that the package being transliterated contains (for perspective: `aws-cdk-lib` has thousands of such snippets).

#### Investigation

Primary goal of the investigation should be to identify the file descriptor leak.
As described above, the most likely cause will be code with unbound parallelism in file system access.

Start by finding a local reproduction of the issue.
This can be achieved by restricting the local soft and hard limits to a low value like `256`.
After this, when running the program locally the same failures or slow-downs should be observable as in the deployed environment.

Next steps will be to identify the code path responsible for the spike in file system calls.
Paste this script into your shell, and then execute the command like so:

```bash
fdwatch() {
    eval "$1 &"
    pid=$!
    while sleep .5; do
        lsof -p $({ echo "$pid"; pgrep -P "$pid"; } | paste -sd , -) | grep -v " txt " | wc -l;
    done
}
```

```console
fdwatch "npx jsii-docgen -p aws-cdk-lib"
```

This will run the command, but also every 500ms print out the number of file descriptors used by it.
If the command is printing sufficient debug logs, this will help you narrow down the offending code path.
For example, the following output would indicate that the issue occurs between printing "Step 2" and "Step 3".

```console
[3] 95150
      26
      47
Installing package aws-cdk-lib
      49
      49
Step 1
      49
      49
Step 2
      49
      4314
      7132
      3001
      49
Step 3
      49
      49
```

#### Resolution

Once the code is identified, ensure file system calls are restricted and verify with the above approach.
Common causes in code are:

##### Unbound use of `Promise.all()`

File system calls inside `Promise.all()` may be executed in parallel.
If the size of list depends on program input and is not a fixed size,
limit parallelism with something like `p-limit` or convert to synchronous processing.

```ts
// 💥 This will spike file system calls
Promise.all(veryLargeList.map(doSomethingWithFileSystem));
```

##### No `await` for file system calls in `for`-loops

File system calls inside a `for`-loop that are not `await`ed (e.g. they are fire-and-forget) will be executed in parallel.
If the size of list depends on program input and is not a fixed size,
await the file system call inside the loop or use synchronous file system access functions.

```ts
for (const item of veryLargeList) {
  // 💥 This will spike file system calls
  fs.promises.readFile()
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
