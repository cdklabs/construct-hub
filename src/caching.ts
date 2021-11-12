import { AddBehaviorOptions, CachePolicy, FunctionEventType } from '@aws-cdk/aws-cloudfront';
import { CacheControl } from '@aws-cdk/aws-s3-deployment';
import { Construct, Duration } from '@aws-cdk/core';
import { ResponseFunction } from './webapp/response-function';

/**
 * Caching policies for serving data in the Construct Hub web app.
 */
export class CacheStrategy {
  /**
   * Cache policy for resources that may frequently change, and should never
   * be cached by the browser.
   */
  public static mutableFrequent() {
    return new CacheStrategy([
      CacheControl.setPublic(),
      CacheControl.noCache(),
    ]);
  }

  /**
   * Cache policy for resources that do not frequently change, but should not
   * be assumed are static, so they are cached for only a short period.
   */
  public static mutableInfrequent() {
    return new CacheStrategy([
      CacheControl.setPublic(),
      CacheControl.maxAge(Duration.minutes(10)),
      CacheControl.mustRevalidate(),
      CacheControl.sMaxAge(Duration.minutes(1)),
      CacheControl.proxyRevalidate(),
    ]);
  }

  /**
   * Cache policy for resources that can be assumed to never change.
   */
  public static static() {
    return new CacheStrategy([
      CacheControl.setPublic(),
      CacheControl.maxAge(Duration.days(1)),
      CacheControl.mustRevalidate(),
      CacheControl.sMaxAge(Duration.minutes(1)),
      CacheControl.proxyRevalidate(),
    ]);
  }

  private constructor(private readonly cacheControl: CacheControl[]) {}

  public toString() {
    return this.cacheControl.map(c => c.value).join(', ');
  }

  public toCloudfrontBehavior(
    scope: Construct,
    id: string,
    options: ToCloudfrontBehaviorOptions,
  ): AddBehaviorOptions {
    // generate a stable unique id for the cloudfront function and use it
    // both for the function name and the logical id of the function so if
    // it is changed the function will be recreated. function name can be no
    // longer than 64 characters.
    // see https://github.com/aws/aws-cdk/issues/15523
    const functionId = `${id.substring(0, 21)}${scope.node.addr}`;

    return {
      compress: true,
      cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      functionAssociations: [{
        function: new ResponseFunction(scope, functionId, {
          functionName: functionId,
          responseHeaders: {
            'cache-control': this.toString(),
            ...options.responseHeaders,
          },
        }),
        eventType: FunctionEventType.VIEWER_RESPONSE,
      }],
    };
  }
}

export interface ToCloudfrontBehaviorOptions {
  readonly responseHeaders: { [key: string]: string };
}