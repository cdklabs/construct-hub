const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const sourceDir = path.join(rootDir, "node_modules", "construct-hub-webapp");

const tmpDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
const tmpApp = path.join(tmpDir, "construct-hub-webapp");

console.log("Installing webapp to tmp directory: ", tmpApp);
// Install app dependencies
childProcess.execSync(
  `
    #!/bin/bash \n
    rm -rf ${path.join(rootDir, 'website')}
    cp -r ${sourceDir} ${tmpDir} \n
    cd ${tmpApp} && yarn && yarn projen
  `,
  { stdio: "inherit" }
);

const externalConfigPath = path.join(tmpApp, "src", "config", "config.ts");

console.log(
  "Writing application config to installed app: ",
  externalConfigPath
);

// Retrieve AppConfig output from Stack
const appConfig = fs.readFileSync(path.join(__dirname, "app-config.ts"), {
  encoding: "utf8",
});

fs.writeFileSync(externalConfigPath, appConfig);

// This is pretty annoying that we need to do this,
// but this config needs to be accessed from the public index.html that will be built by webpack
// rather than the application source code
let hasAnalytics = false;

if (appConfig.includes(`"hasAnalytics": true`)) {
  hasAnalytics = true;
}

if (hasAnalytics) {
  childProcess.execSync(
    `echo REACT_APP_HAS_ANALYTICS=true >> ${path.join(tmpApp, ".env")}`
  );
}

console.log("Writing built app to: ", path.join(rootDir, "website"));
// Build the app with new config
childProcess.execSync(
  `
    #!/bin/bash\n
    cd ${tmpApp} && npx react-app-rewired build\n
    mv ${path.join(tmpApp, "build")} ${path.join(rootDir, "website")}
  `,
  { stdio: "inherit" }
);
