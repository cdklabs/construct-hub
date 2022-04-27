const fs = require('fs');
const https = require('https');
const path = require('path');

function savePrefixLists(list, name) {
  // IPv4 CIDR ranges do NOT include ":"
  fs.writeFileSync(
    path.join(
      process.cwd(),
      'resources',
      'vpc-allow-lists',
      `github.${name}-IPv4.txt`
    ),
    list.filter((cidr) => !cidr.includes(':')).join('\n'),
    'utf-8',
  );

  // We do not emit IPv6 rules, as our VPCs don't have IPv6 support.
}

void https
  .get(
    'https://api.github.com/meta',
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        'User-Agent': `node ${process.versions.node}`,
      },
    },
    (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.once('error', (cause) => {
        console.error('An error occurred: ', cause);
        return process.exit(-1);
      });
      res.once('close', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        if (res.statusCode !== 200) {
          console.error(
            `GET https://api.github.com/meta - HTTP ${res.statusCode} (${res.statusMessage})`
          );
          for (const [name, values] of Object.entries(res.headers)) {
            for (const value of typeof values === 'string' ? [values] : values) {
              console.error(`${name}: ${value}`);
            }
          }
          console.error();
          console.error(data);
          return process.exit(-1);
        }

        savePrefixLists(data.git, 'git');
        savePrefixLists(data.web, 'web');
        savePrefixLists(data.api, 'api');
      });
    }
  )
  .end();
