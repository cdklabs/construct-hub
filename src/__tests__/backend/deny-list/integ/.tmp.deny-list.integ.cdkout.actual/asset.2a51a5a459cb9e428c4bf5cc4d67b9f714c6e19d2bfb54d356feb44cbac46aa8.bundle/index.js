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

// src/backend/deny-list/prune-queue-handler.lambda.ts
var prune_queue_handler_lambda_exports = {};
__export(prune_queue_handler_lambda_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(prune_queue_handler_lambda_exports);
var AWS = __toESM(require("aws-sdk"));

// src/backend/deny-list/constants.ts
var ENV_DELETE_OBJECT_DATA_BUCKET_NAME = "PACKAGE_DATA_BUCKET_NAME";

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

// src/backend/deny-list/prune-queue-handler.lambda.ts
var s3 = new AWS.S3();
async function handler(event) {
  console.log(JSON.stringify({ event }));
  const bucket = requireEnv(ENV_DELETE_OBJECT_DATA_BUCKET_NAME);
  const records = event.Records ?? [];
  for (const record of records) {
    const objectKey = record.body;
    console.log(`deleting s3://${bucket}/${objectKey}`);
    await s3.deleteObject({ Bucket: bucket, Key: objectKey }).promise();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
