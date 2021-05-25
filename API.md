# API Reference

**Classes**

Name|Description
----|-----------
[ConstructHub](#construct-hub-constructhub)|Construct Hub.


**Structs**

Name|Description
----|-----------
[AlarmActions](#construct-hub-alarmactions)|CloudWatch alarm actions to perform.
[ConstructHubProps](#construct-hub-constructhubprops)|Props for `ConstructHub`.
[Domain](#construct-hub-domain)|Domain configuration for the website.



## class ConstructHub 🔹 <a id="construct-hub-constructhub"></a>

Construct Hub.

__Implements__: [IConstruct](#constructs-iconstruct), [IConstruct](#aws-cdk-core-iconstruct), [IConstruct](#constructs-iconstruct), [IDependable](#aws-cdk-core-idependable)
__Extends__: [Construct](#aws-cdk-core-construct)

### Initializer




```ts
new ConstructHub(scope: Construct, id: string, props: ConstructHubProps)
```

* **scope** (<code>[Construct](#constructs-construct)</code>)  *No description*
* **id** (<code>string</code>)  *No description*
* **props** (<code>[ConstructHubProps](#construct-hub-constructhubprops)</code>)  *No description*
  * **alarmActions** (<code>[AlarmActions](#construct-hub-alarmactions)</code>)  Actions to perform when alarms are set. 
  * **dashboardName** (<code>string</code>)  The name of the CloudWatch Dashboard created to observe this application. __*Default*__: "construct-hub"
  * **domain** (<code>[Domain](#construct-hub-domain)</code>)  Connect the hub to a domain (requires a hosted zone and a certificate). __*Optional*__




## struct AlarmActions 🔹 <a id="construct-hub-alarmactions"></a>


CloudWatch alarm actions to perform.



Name | Type | Description 
-----|------|-------------
**highSeverity**🔹 | <code>string</code> | The ARN of the CloudWatch alarm action to take for alarms of high-severity alarms.
**normalSeverity**?🔹 | <code>string</code> | The ARN of the CloudWatch alarm action to take for alarms of normal severity.<br/>__*Default*__: no actions are taken in response to alarms of normal severity



## struct ConstructHubProps 🔹 <a id="construct-hub-constructhubprops"></a>


Props for `ConstructHub`.



Name | Type | Description 
-----|------|-------------
**alarmActions**🔹 | <code>[AlarmActions](#construct-hub-alarmactions)</code> | Actions to perform when alarms are set.
**dashboardName**?🔹 | <code>string</code> | The name of the CloudWatch Dashboard created to observe this application.<br/>__*Default*__: "construct-hub"
**domain**?🔹 | <code>[Domain](#construct-hub-domain)</code> | Connect the hub to a domain (requires a hosted zone and a certificate).<br/>__*Optional*__



## struct Domain 🔹 <a id="construct-hub-domain"></a>


Domain configuration for the website.



Name | Type | Description 
-----|------|-------------
**cert**🔹 | <code>[ICertificate](#aws-cdk-aws-certificatemanager-icertificate)</code> | The certificate to use for serving the Construct Hub over a custom domain.
**zone**🔹 | <code>[IHostedZone](#aws-cdk-aws-route53-ihostedzone)</code> | The root domain name where this instance of Construct Hub will be served.



