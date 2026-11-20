import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { API_QUERY_FUNCTION_CODE } from '../lib/api-query';
import { InfraStack } from '../lib/infra-stack';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let template: Template;

const cspFunctionResource = () =>
  Object.values(template.findResources('AWS::CloudFront::Function')).find((f) =>
    String(f.Properties.FunctionCode).includes('content-security-policy'),
  )!;

beforeAll(() => {
  const siteDir = mkdtempSync(join(tmpdir(), 'site-'));
  writeFileSync(join(siteDir, 'index.html'), '<!doctype html>');
  // Skip esbuild in unit tests (`npm run synth` bundles for real).
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new InfraStack(app, 'TestStack', {
    siteDir,
    rdapHosts: ['https://rdap.nic.example'],
    repoRoot,
  });
  template = Template.fromStack(stack);
});

describe('site bucket', () => {
  it('is private, encrypted, TLS-only and not a website', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      WebsiteConfiguration: Match.absent(),
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('grants read only to CloudFront, scoped to this distribution', () => {
    const policies = template.findResources('AWS::S3::BucketPolicy');
    const statements = Object.values(policies).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as Record<string, unknown>[],
    );
    const allows = statements.filter((s) => s.Effect === 'Allow');
    const cfRead = allows.filter(
      (s) =>
        JSON.stringify(s.Principal) === JSON.stringify({ Service: 'cloudfront.amazonaws.com' }),
    );
    expect(cfRead.length).toBeGreaterThan(0);
    for (const s of cfRead) expect(JSON.stringify(s.Condition)).toContain('AWS:SourceArn');
    for (const s of allows) expect(s.Principal).not.toBe('*');
  });
});

describe('distribution', () => {
  it('reads S3 through Origin Access Control, HTTPS only, index.html root', () => {
    // One OAC for S3, one for the API's Lambda function URL.
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      }),
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        Aliases: Match.absent(),
        Origins: Match.arrayWith([
          Match.objectLike({
            OriginAccessControlId: Match.anyValue(),
            S3OriginConfig: { OriginAccessIdentity: '' },
          }),
        ]),
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
      }),
    });
  });
});

describe('security headers', () => {
  it('sets HSTS (preload), nosniff, no-referrer and DENY framing on every behavior', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 63072000,
            IncludeSubdomains: true,
            Preload: true,
            Override: true,
          },
          ContentTypeOptions: { Override: true },
          ReferrerPolicy: { ReferrerPolicy: 'no-referrer', Override: true },
          FrameOptions: { FrameOption: 'DENY', Override: true },
        }),
      }),
    });
    const dist = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0]!;
    const cfg = dist.Properties.DistributionConfig;
    for (const b of [cfg.DefaultCacheBehavior, ...(cfg.CacheBehaviors ?? [])]) {
      expect(b.ResponseHeadersPolicyId).toBeDefined();
    }
  });

  it('attaches the generated CSP via a viewer-response function on every behavior', () => {
    // Two functions: this CSP one, and the /api/* cache-key one (ticket 20).
    expect(Object.values(template.findResources('AWS::CloudFront::Function'))).toHaveLength(2);
    const fn = cspFunctionResource();
    expect(fn.Properties.FunctionConfig.Runtime).toBe('cloudfront-js-2.0');
    expect(fn.Properties.AutoPublish).toBe(true);
    const code: string = fn.Properties.FunctionCode;
    const res = new Function(`${code}\nreturn handler;`)()({ response: { headers: {} } });
    const csp: string = res.headers['content-security-policy'].value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/connect-src [^;]*https:\/\/rdap\.nic\.example/);

    const dist = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0]!;
    const cfg = dist.Properties.DistributionConfig;
    for (const b of [cfg.DefaultCacheBehavior, ...(cfg.CacheBehaviors ?? [])]) {
      const responseFns = (b.FunctionAssociations as { EventType: string }[]).filter(
        (f) => f.EventType === 'viewer-response',
      );
      expect(responseFns).toHaveLength(1);
    }
  });

  it('leaves JSON API responses intact apart from adding the CSP', () => {
    const fn = cspFunctionResource();
    const handler = new Function(`${fn.Properties.FunctionCode}\nreturn handler;`)();
    const headers = {
      'content-type': { value: 'application/json; charset=utf-8' },
      'access-control-allow-origin': { value: '*' },
      'cache-control': { value: 'public, max-age=3600' },
    };
    const res = handler({ response: { statusCode: 200, headers: { ...headers } } });
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject(headers);
    expect(Object.keys(res.headers)).toEqual([...Object.keys(headers), 'content-security-policy']);
  });
});

describe('JSON API (ADR-0006)', () => {
  const resources = (type: string) => Object.values(template.findResources(type));
  const config = () => resources('AWS::CloudFront::Distribution')[0]!.Properties.DistributionConfig;
  const apiBehavior = () =>
    (config().CacheBehaviors as Record<string, unknown>[]).find((b) => b.PathPattern === 'api/*')!;
  const resource = (ref: unknown) =>
    template.toJSON().Resources[(ref as { Ref: string }).Ref] as {
      Type: string;
      Properties: Record<string, never>;
    };

  it('runs Node 22 on arm64 with 512 MB, a 15 s timeout and no reserved concurrency', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      MemorySize: 512,
      Timeout: 15,
      Handler: 'index.handler',
      ReservedConcurrentExecutions: Match.absent(),
    });
  });

  it('keeps its logs for one week', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
    const fn = resources('AWS::Lambda::Function').find(
      (f) => f.Properties.Runtime === 'nodejs22.x',
    )!;
    expect(fn.Properties.LoggingConfig.LogGroup).toEqual({ Ref: expect.stringMatching(/ApiLogs/) });
  });

  it('has a function URL with AWS_IAM auth, so direct calls are refused', () => {
    template.resourceCountIs('AWS::Lambda::Url', 1);
    template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM' });
  });

  it('is reached through Origin Access Control for Lambda, invocable only by this distribution', () => {
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: 'lambda',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      }),
    });
    const perms = resources('AWS::Lambda::Permission');
    expect(perms.map((p) => p.Properties.Action).sort()).toEqual([
      'lambda:InvokeFunction',
      'lambda:InvokeFunctionUrl',
    ]);
    for (const p of perms) {
      expect(p.Properties.Principal).toBe('cloudfront.amazonaws.com');
      expect(JSON.stringify(p.Properties.SourceArn)).toContain(':distribution/');
    }
    const apiOrigin = (config().Origins as Record<string, unknown>[]).find(
      (o) => o.Id === apiBehavior().TargetOriginId,
    )!;
    expect(apiOrigin).toMatchObject({
      OriginAccessControlId: expect.anything(),
      CustomOriginConfig: { OriginProtocolPolicy: 'https-only', OriginReadTimeout: 15 },
    });
  });

  it('routes /api/* to the function: HTTPS only, GET/HEAD only, site security headers and CSP', () => {
    const b = apiBehavior();
    expect(b).toMatchObject({
      ViewerProtocolPolicy: 'https-only',
      AllowedMethods: ['GET', 'HEAD'],
      CachedMethods: ['GET', 'HEAD'],
      ResponseHeadersPolicyId: config().DefaultCacheBehavior.ResponseHeadersPolicyId,
    });
    const events = (b.FunctionAssociations as { EventType: string }[]).map((f) => f.EventType);
    expect(events.sort()).toEqual(['viewer-request', 'viewer-response']);
    expect(b.FunctionAssociations).toEqual(
      expect.arrayContaining(config().DefaultCacheBehavior.FunctionAssociations),
    );
  });

  it('canonicalises the query string on /api/* before the cache key (ticket 20)', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
      FunctionCode: API_QUERY_FUNCTION_CODE,
    });
  });

  it('caches for 1 h by default, keyed on the org and domain query strings only', () => {
    const policy = resource(apiBehavior().CachePolicyId);
    expect(policy.Type).toBe('AWS::CloudFront::CachePolicy');
    expect(policy.Properties.CachePolicyConfig).toMatchObject({
      DefaultTTL: 3600,
      MinTTL: 0,
      MaxTTL: 3600,
      ParametersInCacheKeyAndForwardedToOrigin: {
        QueryStringsConfig: { QueryStringBehavior: 'whitelist', QueryStrings: ['org', 'domain'] },
        HeadersConfig: { HeaderBehavior: 'none' },
        CookiesConfig: { CookieBehavior: 'none' },
      },
    });
  });

  it('forwards only the org and domain query strings to the origin (no Host header)', () => {
    const policy = resource(apiBehavior().OriginRequestPolicyId);
    expect(policy.Type).toBe('AWS::CloudFront::OriginRequestPolicy');
    expect(policy.Properties.OriginRequestPolicyConfig).toMatchObject({
      QueryStringsConfig: { QueryStringBehavior: 'whitelist', QueryStrings: ['org', 'domain'] },
      HeadersConfig: { HeaderBehavior: 'none' },
      CookiesConfig: { CookieBehavior: 'none' },
    });
  });

  it('uses no other AWS services: no secrets, tables, queues or extra functions', () => {
    for (const type of [
      'AWS::SecretsManager::Secret',
      'AWS::SSM::Parameter',
      'AWS::DynamoDB::Table',
      'AWS::SQS::Queue',
      'AWS::ApiGateway::RestApi',
      'AWS::ApiGatewayV2::Api',
      'AWS::Lambda::EventSourceMapping',
    ]) {
      template.resourceCountIs(type, 0);
    }
  });
});

describe('caching', () => {
  const ttlOf = (ref: unknown) => {
    const id = (ref as { Ref: string }).Ref;
    const policy = template.toJSON().Resources[id];
    return policy.Properties.CachePolicyConfig as { DefaultTTL: number; MaxTTL: number };
  };
  const config = () =>
    Object.values(template.findResources('AWS::CloudFront::Distribution'))[0]!.Properties
      .DistributionConfig;

  it('caches hashed assets for a year', () => {
    const assets = (config().CacheBehaviors as Record<string, unknown>[]).find(
      (b) => b.PathPattern === 'assets/*',
    );
    expect(assets).toBeDefined();
    expect(assets!.ViewerProtocolPolicy).toBe('redirect-to-https');
    expect(ttlOf(assets!.CachePolicyId).DefaultTTL).toBe(31536000);
  });

  it('keeps index.html and other unhashed files fresh (≤ 5 minutes)', () => {
    const ttl = ttlOf(config().DefaultCacheBehavior.CachePolicyId);
    expect(ttl.DefaultTTL).toBeLessThanOrEqual(60);
    expect(ttl.MaxTTL).toBeLessThanOrEqual(300);
  });
});

describe('deployment and outputs', () => {
  it('uploads the site, prunes stale files and invalidates CloudFront', () => {
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      Prune: true,
      DistributionId: Match.anyValue(),
      DistributionPaths: ['/*'],
    });
  });

  it('exports the distribution URL, bucket name and distribution ID', () => {
    const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        'DistributionUrl',
        'BucketName',
        'DistributionId',
        'ApiHealthUrl',
        'ApiFunctionUrl',
      ]),
    );
    expect(JSON.stringify(outputs.DistributionUrl!.Value)).toContain('https://');
  });
});
