"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/__tests__/backend/deny-list/integ/trigger.prune-test.lambda.ts
var trigger_prune_test_lambda_exports = {};
__export(trigger_prune_test_lambda_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(trigger_prune_test_lambda_exports);
var AWS = __toESM(require("aws-sdk"));

// src/backend/shared/env.lambda-shared.ts
var import_process = require("process");
function requireEnv(name) {
  const result = import_process.env[name];
  if (!result) {
    throw new Error(
      `No value specified for required environment variable: ${name}`
    );
  }
  return result;
}

// src/__tests__/backend/deny-list/integ/trigger.prune-test.lambda.ts
var s3 = new AWS.S3();
async function handler() {
  const bucketName = requireEnv("BUCKET_NAME");
  const timeoutSec = parseInt(requireEnv("TIMEOUT_SEC"));
  const expectedKeys = JSON.parse(requireEnv("EXPECTED_KEYS"));
  const expected = canonicalRepresentation(expectedKeys);
  console.log(JSON.stringify({ expected: expectedKeys }));
  const startTime = Date.now();
  let actual;
  while ((Date.now() - startTime) / 1e3 < timeoutSec) {
    actual = canonicalRepresentation(await getAllObjectKeys(bucketName));
    console.log(JSON.stringify({ keys: actual }));
    if (actual === expected) {
      console.log("assertion succeeded");
      return;
    }
  }
  throw new Error(
    `assertion failed. the following objects were not deleted after ${timeoutSec}s. Actual: ${actual}. Expected: ${expected}`
  );
}
async function getAllObjectKeys(bucket) {
  let continuationToken;
  const objectKeys = new Array();
  do {
    const listRequest = {
      Bucket: bucket,
      ContinuationToken: continuationToken
    };
    console.log(JSON.stringify({ listRequest }));
    const listResponse = await s3.listObjectsV2(listRequest).promise();
    console.log(JSON.stringify({ listResponse }));
    continuationToken = listResponse.NextContinuationToken;
    for (const { Key: key } of listResponse.Contents ?? []) {
      if (!key) {
        continue;
      }
      objectKeys.push(key);
    }
  } while (continuationToken);
  return objectKeys;
}
function canonicalRepresentation(list) {
  return JSON.stringify(list.sort());
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
