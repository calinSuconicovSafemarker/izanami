import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { InfraStack } from '../lib/infra-stack';

let template: Template;

beforeAll(() => {
  const siteDir = mkdtempSync(join(tmpdir(), 'site-'));
  writeFileSync(join(siteDir, 'index.html'), '<!doctype html>');
  const app = new App();
  const stack = new InfraStack(app, 'TestStack', {
    siteDir,
    rdapHosts: ['https://rdap.nic.example'],
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
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: {
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        Aliases: Match.absent(),
        Origins: [
          Match.objectLike({
            OriginAccessControlId: Match.anyValue(),
            S3OriginConfig: { OriginAccessIdentity: '' },
          }),
        ],
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
    const fns = Object.values(template.findResources('AWS::CloudFront::Function'));
    expect(fns).toHaveLength(1);
    const fn = fns[0]!;
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
      expect(b.FunctionAssociations).toHaveLength(1);
      expect(b.FunctionAssociations[0].EventType).toBe('viewer-response');
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
      expect.arrayContaining(['DistributionUrl', 'BucketName', 'DistributionId']),
    );
    expect(JSON.stringify(outputs.DistributionUrl!.Value)).toContain('https://');
  });
});
