import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { buildCsp, cspFunctionCode } from './csp';

export interface InfraStackProps extends StackProps {
  /** Directory with the built site (`web/dist`). */
  readonly siteDir: string;
  /** RDAP server origins from `web/src/data/rdap-hosts.json` `.hosts`. */
  readonly rdapHosts: readonly string[];
}

/** Static hosting for `web/dist`: private S3 + CloudFront (ADR-0004). */
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

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: { ...common, cachePolicy: shortLived },
      additionalBehaviors: { 'assets/*': { ...common, cachePolicy: immutableAssets } },
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
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
