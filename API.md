# API Reference

**Classes**

Name|Description
----|-----------
[ConstructHub](#construct-hub-constructhub)|*No description*


**Structs**

Name|Description
----|-----------
[ConstructHubProps](#construct-hub-constructhubprops)|*No description*
[ContactURLs](#construct-hub-contacturls)|*No description*



## class ConstructHub 🔹 <a id="construct-hub-constructhub"></a>



__Implements__: [IConstruct](#constructs-iconstruct), [IConstruct](#aws-cdk-core-iconstruct), [IConstruct](#constructs-iconstruct), [IDependable](#aws-cdk-core-idependable)
__Extends__: [Construct](#aws-cdk-core-construct)

### Initializer




```ts
new ConstructHub(scope: Construct, id: string, _props: ConstructHubProps)
```

* **scope** (<code>[Construct](#aws-cdk-core-construct)</code>)  *No description*
* **id** (<code>string</code>)  *No description*
* **_props** (<code>[ConstructHubProps](#construct-hub-constructhubprops)</code>)  *No description*
  * **hostedZone** (<code>[IHostedZone](#aws-cdk-aws-route53-ihostedzone)</code>)  The root domain name where this instance of Construct Hub will be served. 
  * **contactUrls** (<code>[ContactURLs](#construct-hub-contacturls)</code>)  Contact URLs to be used for contacting this Construct Hub operators. __*Default*__: none
  * **dashboardName** (<code>string</code>)  The name of the CloudWatch Dashboard created to observe this application. __*Default*__: the path to this construct is used as the dashboard name.
  * **enableNpmFeed** (<code>boolean</code>)  Whether the package feed from the npmjs.com registry should be enabled. __*Default*__: true
  * **pathPrefix** (<code>string</code>)  An optional path prefix to use for serving the Construct Hub. __*Default*__: none.
  * **tlsCertificate** (<code>[ICertificate](#aws-cdk-aws-certificatemanager-icertificate)</code>)  The certificate to use for serving the Construct Hub over a custom domain. __*Default*__: a DNS-Validated certificate will be provisioned using the   provided `hostedZone`.
  * **updatesTopic** (<code>[ITopic](#aws-cdk-aws-sns-itopic)</code>)  An optional topic to be notified whenever a new package is indexed into this Construct Hub instance. __*Default*__: none




## struct ConstructHubProps 🔹 <a id="construct-hub-constructhubprops"></a>






Name | Type | Description 
-----|------|-------------
**hostedZone**🔹 | <code>[IHostedZone](#aws-cdk-aws-route53-ihostedzone)</code> | The root domain name where this instance of Construct Hub will be served.
**contactUrls**?🔹 | <code>[ContactURLs](#construct-hub-contacturls)</code> | Contact URLs to be used for contacting this Construct Hub operators.<br/>__*Default*__: none
**dashboardName**?🔹 | <code>string</code> | The name of the CloudWatch Dashboard created to observe this application.<br/>__*Default*__: the path to this construct is used as the dashboard name.
**enableNpmFeed**?🔹 | <code>boolean</code> | Whether the package feed from the npmjs.com registry should be enabled.<br/>__*Default*__: true
**pathPrefix**?🔹 | <code>string</code> | An optional path prefix to use for serving the Construct Hub.<br/>__*Default*__: none.
**tlsCertificate**?🔹 | <code>[ICertificate](#aws-cdk-aws-certificatemanager-icertificate)</code> | The certificate to use for serving the Construct Hub over a custom domain.<br/>__*Default*__: a DNS-Validated certificate will be provisioned using the   provided `hostedZone`.
**updatesTopic**?🔹 | <code>[ITopic](#aws-cdk-aws-sns-itopic)</code> | An optional topic to be notified whenever a new package is indexed into this Construct Hub instance.<br/>__*Default*__: none



## struct ContactURLs 🔹 <a id="construct-hub-contacturls"></a>






Name | Type | Description 
-----|------|-------------
**other**?🔹 | <code>string</code> | The URL to the issue tracker or documentation for reporting other issues.<br/>__*Default*__: none
**securityIssue**?🔹 | <code>string</code> | The URL to the issue tracker or documentation for reporting security issues.<br/>__*Default*__: none
**unlistPackage**?🔹 | <code>string</code> | The URL to the issue tracker or documentation for requesting a package be un-listed from this Construct Hub instance.<br/>__*Default*__: none



