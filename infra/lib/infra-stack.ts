import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
} from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { join } from 'node:path';
import { API_QUERY_FUNCTION_CODE } from './api-query';
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
/** How cdk-nag names the AWS managed policy every Lambda in this stack uses for logging. */
const BASIC_EXECUTION_POLICY =
  'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';

export const API_QUERY_STRINGS = ['org', 'domain'] as const;

/**
 * Static hosting for `web/dist`: private S3 + CloudFront (ADR-0004), plus the JSON API under
 * `/api/*`: a Lambda function URL reachable only through CloudFront (ADR-0006).
 */
export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    // Access logs for the site bucket and CloudFront (ticket 23): private, encrypted, 30 days.
    const logBucket = new s3.Bucket(this, 'LogBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // CloudFront standard logging writes with ACLs, so they can't be disabled on this bucket.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      lifecycleRules: [{ expiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    Validations.of(logBucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason: 'This is the access-log bucket; logging it into itself would loop.',
    });

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 's3/',
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
      // Not removing x-amzn-requestid / x-amzn-trace-id: CloudFront rejects removeHeaders for
      // X-Amzn-* (deploy failed 2026-11-20). Info-level only; accepted in the security report.
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
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logGroup: apiLogs,
      bundling: {
        // Local esbuild (devDependency); no Docker.
        forceDockerBundling: false,
        format: nodejs.OutputFormat.CJS,
        target: 'node24',
        minify: true,
        sourceMap: false,
      },
    });
    // AWS_IAM: only CloudFront, signing with Origin Access Control, may invoke it.
    Validations.of(apiFunction).acknowledge(
      {
        id: `AwsSolutions-IAM4[${BASIC_EXECUTION_POLICY}]`,
        reason: 'AWSLambdaBasicExecutionRole only allows writing its own CloudWatch logs.',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'Node.js 24 is the newest GA Lambda runtime; nodejs26.x is a preview without SLA.',
      },
    );
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
    // Canonicalises org/domain before the cache key is computed (ticket 20).
    const apiQueryFunction = new cloudfront.Function(this, 'ApiQueryFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Canonical cache key for /api/* (ADR-0006)',
      code: cloudfront.FunctionCode.fromInline(API_QUERY_FUNCTION_CODE),
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
      enableLogging: true,
      logBucket,
      logFilePrefix: 'cloudfront/',
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
          functionAssociations: [
            ...common.functionAssociations,
            { function: apiQueryFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
    });

    Validations.of(distribution).acknowledge(
      { id: 'AwsSolutions-CFR1', reason: 'A lookalike checker is useful worldwide; no geo block.' },
      {
        id: 'AwsSolutions-CFR2',
        reason: 'WAF costs money; open decision in ADR-0006 Amendment 1 (ticket 20).',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'The default *.cloudfront.net certificate does not allow a TLS minimum; needs a custom domain.',
      },
    );

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(props.siteDir)],
      destinationBucket: bucket,
      prune: true,
      distribution,
      distributionPaths: ['/*'],
    });
    // CDK's own singleton function behind BucketDeployment: runtime, role and policy are CDK's.
    const deployHandler = this.node.children.find((c) =>
      c.node.id.startsWith('Custom::CDKBucketDeployment'),
    );
    if (deployHandler) {
      const reason =
        'CDK-managed BucketDeployment handler (runtime and IAM chosen by aws-cdk-lib).';
      const iam5 = [
        'Action::s3:GetObject*',
        'Action::s3:GetBucket*',
        'Action::s3:List*',
        'Action::s3:DeleteObject*',
        'Action::s3:Abort*',
        'Resource::*',
        'Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-<AWS::AccountId>-<AWS::Region>/*',
        `Resource::<${this.getLogicalId(bucket.node.defaultChild as s3.CfnBucket)}.Arn>/*`,
      ];
      Validations.of(deployHandler).acknowledge(
        { id: `AwsSolutions-IAM4[${BASIC_EXECUTION_POLICY}]`, reason },
        { id: 'AwsSolutions-L1', reason },
        ...iam5.map((finding) => ({ id: `AwsSolutions-IAM5[${finding}]`, reason })),
      );
    }

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
