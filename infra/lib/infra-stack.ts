import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { join } from 'node:path';
import { buildCsp, cspFunctionCode } from './csp';

export interface InfraStackProps extends StackProps {
  /** Directory with the built site (`web/dist`). */
  readonly siteDir: string;
  /** RDAP server origins from `web/src/data/rdap-hosts.json` `.hosts`. */
  readonly rdapHosts: readonly string[];
  /** Repository root (holds `package-lock.json`); the API is bundled from `api/src/handler.ts`. */
  readonly repoRoot: string;
}

/** The query strings `/api/check` reads; the only ones in the cache key and sent to Lambda. */
export const API_QUERY_STRINGS = ['org', 'domain'] as const;

/**
 * Static hosting for `web/dist`: private S3 + CloudFront (ADR-0004), plus the JSON API under
 * `/api/*`: a Lambda function URL reachable only through CloudFront (ADR-0006).
 */
export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CSP is too long for a ResponseHeadersPolicy (1783-char limit), so a function adds it.
    const cspFunction = new cloudfront.Function(this, 'CspFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Adds the generated Content-Security-Policy (ADR-0004)',
      code: cloudfront.FunctionCode.fromInline(cspFunctionCode(buildCsp(props.rdapHosts))),
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'Security headers except CSP (ADR-0004)',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(63072000),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
          override: true,
        },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
      },
    });

    // Vite content-hashes everything under assets/, so it can be cached for a year.
    const immutableAssets = new cloudfront.CachePolicy(this, 'ImmutableAssets', {
      comment: 'Content-hashed build assets',
      defaultTtl: Duration.days(365),
      minTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    // index.html and other unhashed files: short TTL so a deploy shows up quickly.
    const shortLived = new cloudfront.CachePolicy(this, 'ShortLived', {
      comment: 'index.html and unhashed files',
      defaultTtl: Duration.seconds(60),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(300),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);
    const common = {
      origin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy: securityHeaders,
      functionAssociations: [
        { function: cspFunction, eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE },
      ],
    } satisfies cloudfront.BehaviorOptions;

    // JSON API (ticket 18, ADR-0006). No reserved concurrency: the account allows 10 concurrent
    // executions in total (checked 2026-11-19), which already caps cost and upstream load, and
    // reserving any would fail: Lambda requires a minimum of unreserved concurrency.
    const apiLogs = new logs.LogGroup(this, 'ApiLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const apiFunction = new nodejs.NodejsFunction(this, 'ApiFunction', {
      description: 'Izanami JSON API (ADR-0006)',
      entry: join(props.repoRoot, 'api', 'src', 'handler.ts'),
      handler: 'handler',
      projectRoot: props.repoRoot,
      depsLockFilePath: join(props.repoRoot, 'package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logGroup: apiLogs,
      bundling: {
        // Local esbuild (devDependency); no Docker.
        forceDockerBundling: false,
        format: nodejs.OutputFormat.CJS,
        target: 'node22',
        minify: true,
        sourceMap: false,
      },
    });
    // AWS_IAM: only CloudFront, signing with Origin Access Control, may invoke it.
    const apiUrl = apiFunction.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM });
    const apiOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(apiUrl, {
      readTimeout: Duration.seconds(15),
    });
    // Repeat checks are served from the edge for an hour and never reach the upstreams.
    const apiCache = new cloudfront.CachePolicy(this, 'ApiCache', {
      comment: 'JSON API: keyed on org and domain only',
      defaultTtl: Duration.hours(1),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.hours(1),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(...API_QUERY_STRINGS),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    // No headers: forwarding Host would break the SigV4 signature OAC adds for the function URL.
    const apiOriginRequest = new cloudfront.OriginRequestPolicy(this, 'ApiOriginRequest', {
      comment: 'JSON API: forward org and domain only',
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.allowList(
        ...API_QUERY_STRINGS,
      ),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.none(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: { ...common, cachePolicy: shortLived },
      additionalBehaviors: {
        'assets/*': { ...common, cachePolicy: immutableAssets },
        // Same security headers and CSP function as the site (harmless on JSON).
        'api/*': {
          ...common,
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: apiCache,
          originRequestPolicy: apiOriginRequest,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(props.siteDir)],
      destinationBucket: bucket,
      prune: true,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'ApiHealthUrl', {
      value: `https://${distribution.distributionDomainName}/api/health`,
    });
    // Calling this directly must give 403 (AWS_IAM auth); it is output only to verify that.
    new CfnOutput(this, 'ApiFunctionUrl', { value: apiUrl.url });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
