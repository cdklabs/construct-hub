var synthetics = require('Synthetics');

const apiCanaryBlueprint = async function () {
    
    // Handle validation for positive scenario
    const validateHeader = async function(res) {
        return new Promise((resolve, reject) => {
            if (res.statusCode < 200 || res.statusCode > 299) {
                throw res.statusCode + ' ' + res.statusMessage;
            }
     
            if (!(res.hasHeader('X-Frame-Options') || res.getHeader('X-Frame-Options')[0] !== 'deny')) {
                throw 'X-Frame-Options header is malformed';
            };

            res.on('end', () => {
                resolve();
            });
        });
    };
    

    // Set request option for Verify constructs.dev
    let requestOptionsStep1 = {
        hostname: 'constructs.dev',
        method: 'GET',
        path: '',
        port: '443',
        protocol: 'https:',
        body: "",
        headers: {}
    };
    requestOptionsStep1['headers']['User-Agent'] = [synthetics.getCanaryUserAgentString(), requestOptionsStep1['headers']['User-Agent']].join(' ');

    // Set step config option for Verify constructs.dev
   let stepConfig1 = {
        includeRequestHeaders: false,
        includeResponseHeaders: false,
        includeRequestBody: false,
        includeResponseBody: false,
        restrictedHeaders: [],
        continueOnHttpStepFailure: true
    };

    await synthetics.executeHttpStep('Verify constructs.dev', requestOptionsStep1, validateHeader, stepConfig1);
    
};

exports.handler = async () => {
    return await apiCanaryBlueprint();
};
