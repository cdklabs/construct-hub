
import * as AWS from 'aws-sdk';
import * as Nano from 'nano';


const TIMEOUT_MILLISECONDS = 50000;
const CONSTRUCT_KEYWORDS = ['cdk', 'aws-cdk'];
const MARKER_FILE_NAME = 'marker';

export async function handler() {
  if (!process.env?.BUCKET) {
    console.error('The BUCKET environment variable is not set');
    return;
  }

  let marker;
  // load marker from bucket
  try {
    const client = new AWS.S3();
    marker = await client.getObject({
      Bucket: 'sequence-store', //process.env.BUCKET,
      Key: MARKER_FILE_NAME,
    }).promise();
  } catch (error) {
    console.error(`fail to load marker for bucket: ${process.env.BUCKET}, reading from latest`);
  }

  console.log(`starting update stream read from ${marker}`);

  const config = {
    includeDocs: true,
    wait: true,
    since: marker?.Body ? marker.Body.toString() : '0',
    // `changesReader.get` should stop once a response with zero changes is received, however it waits too long for the rate of npmjs updates.
    //  since we want to terminate the Lambda function we define a timeout shorter than the default
    timeout: TIMEOUT_MILLISECONDS,
  };

  const nano = Nano('https://replicate.npmjs.com/');
  const db = nano.db.use('registry');

  db.changesReader.get(config)
    .on('batch', (batch: []) => {
      console.log(`received a batch of ${batch.length} length`);
      batch.filter((update: Update) => !update.deleted)
        .map((update: Update) => update.doc)
        .filter((doc: Document) => isConstruct(doc))
        .map((doc: Document) => getLatestVersion(doc))
        .map((entry: PackageJson) => {
          console.log(`${entry.name}`);
          // send sqs message
          // update marker
        });
      db.changesReader.resume();
    }).on('end', () => {
      console.log('changes feed monitoring has stopped');
    });

}
/**
* @param update
* @returns the latest version from the versions array
*/
function getLatestVersion(doc: Document): PackageJson {
  return doc.versions[doc['dist-tags'].latest];
}

/**
* This method applies different heuristics to check if this is a Construct
* @param pkgJason
* @returns
*/
function isConstruct(doc: Document): boolean {
  // currently we only check for specific keywords, in the future we can check additional things such as, jsii clause and aws cdk dependencies in package.json
  return doc.keywords?.some(k => CONSTRUCT_KEYWORDS.includes(k));
}

interface PackageJson {
  readonly devDependencies?: { readonly [name: string]: string };
  readonly jsii: {};
  readonly name: string;
  readonly [key: string]: unknown;
}

interface Document {
  /**
  * The package versions
  */
  versions: {[key:string]: PackageJson};

  /**
  * The package keywords
  */
  keywords: string[];

  /**
  * The latest version of the package
  */
  'dist-tags': {latest: string};
}

interface Update {
  sequence: Number;
  doc: Document;
  id: string;
  deleted: boolean;
}