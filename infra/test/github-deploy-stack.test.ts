import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { GitHubDeployStack } from '../lib/github-deploy-stack';

const env = { account: '111122223333', region: 'eu-west-1' };

function synth(props: Partial<ConstructorParameters<typeof GitHubDeployStack>[2]> = {}) {
  const app = new App();
  const stack = new GitHubDeployStack(app, 'TestDeploy', {
    env,
    repository: 'example-owner/example-repo',
    ...props,
  });
  return Template.fromStack(stack);
}

describe('GitHub OIDC provider', () => {
  it('creates the token.actions.githubusercontent.com provider for sts.amazonaws.com', () => {
    const t = synth();
    t.resourceCountIs('AWS::IAM::OIDCProvider', 1);
    t.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    // native resource, no custom-resource Lambda
    t.resourceCountIs('AWS::Lambda::Function', 0);
  });

  it('reuses an existing provider when its ARN is given', () => {
    const arn = 'arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com';
    const t = synth({ existingOidcProviderArn: arn });
    t.resourceCountIs('AWS::IAM::OIDCProvider', 0);
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Federated: arn } })],
      },
    });
  });
});

describe('deploy role trust policy', () => {
  it('only trusts web identities from the aws-deploy environment of the configured repo', () => {
    const t = synth();
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'sts:AssumeRoleWithWebIdentity',
            Principal: { Federated: Match.anyValue() },
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:example-owner/example-repo:environment:aws-deploy',
              },
            },
          },
        ],
      },
      MaxSessionDuration: 3600,
    });
  });

  it('has no wildcard or StringLike subject that a fork or PR could match', () => {
    const roles = synth().findResources('AWS::IAM::Role');
    const trust = JSON.stringify(
      Object.values(roles).map((r) => r.Properties.AssumeRolePolicyDocument),
    );
    expect(trust).not.toContain('StringLike');
    expect(trust).not.toContain('*');
    expect(trust).not.toContain('pull_request');
    // a branch-ref subject would let any job on main (e.g. an npm build) assume the role
    expect(trust).not.toContain(':ref:');
  });

  it('honours a custom environment', () => {
    synth({ environment: 'production' }).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: Match.objectLike({
                'token.actions.githubusercontent.com:sub':
                  'repo:example-owner/example-repo:environment:production',
              }),
            },
          }),
        ],
      },
    });
  });

  it('rejects a malformed environment', () => {
    expect(() => synth({ environment: '*' })).toThrow(/environment/);
    expect(() => synth({ environment: 'a:b' })).toThrow(/environment/);
    expect(() => synth({ environment: '' })).toThrow(/environment/);
  });

  it('rejects a malformed repository', () => {
    expect(() => synth({ repository: 'no-slash' })).toThrow(/owner\/name/);
    expect(() => synth({ repository: 'a/b*' })).toThrow(/owner\/name/);
  });
});

describe('deploy role permissions', () => {
  it('can only assume the CDK bootstrap roles of this account and region', () => {
    const t = synth();
    const roles = t.findResources('AWS::IAM::Role');
    for (const r of Object.values(roles)) {
      expect(r.Properties.ManagedPolicyArns).toBeUndefined();
    }
    const policies = t.findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as Record<string, unknown>[],
    );
    expect(statements).toEqual([
      {
        Effect: 'Allow',
        Action: 'sts:AssumeRole',
        Resource: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map((kind) => ({
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              `:iam::111122223333:role/cdk-hnb659fds-${kind}-role-111122223333-eu-west-1`,
            ],
          ],
        })),
      },
    ]);
  });

  it('follows a custom bootstrap qualifier', () => {
    const policies = synth({ bootstrapQualifier: 'abc123xyz' }).findResources('AWS::IAM::Policy');
    expect(JSON.stringify(policies)).toContain(
      'role/cdk-abc123xyz-deploy-role-111122223333-eu-west-1',
    );
    expect(JSON.stringify(policies)).not.toContain('hnb659fds');
  });

  it('outputs the role ARN for the AWS_ROLE_ARN repo variable', () => {
    synth().hasOutput('DeployRoleArn', { Value: { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] } });
  });
});
