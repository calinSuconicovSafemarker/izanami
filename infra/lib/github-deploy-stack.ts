import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const ISSUER = 'token.actions.githubusercontent.com';
const AUDIENCE = 'sts.amazonaws.com';
const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export interface GitHubDeployStackProps extends StackProps {
  /** GitHub repository allowed to deploy, as `owner/name`. */
  readonly repository: string;
  /** Branch allowed to deploy. Default `main`. */
  readonly branch?: string;
  /** CDK bootstrap qualifier. Default `hnb659fds` (the CDK default). */
  readonly bootstrapQualifier?: string;
  /** ARN of an existing GitHub OIDC provider in the account (only one may exist per URL). */
  readonly existingOidcProviderArn?: string;
}

/**
 * GitHub Actions OIDC provider plus a deploy role that only the given repo's
 * branch can assume, and that can do nothing except assume the CDK bootstrap roles.
 */
export class GitHubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubDeployStackProps) {
    super(scope, id, props);
    if (!REPO_PATTERN.test(props.repository)) {
      throw new Error(`repository must be "owner/name", got "${props.repository}"`);
    }
    const branch = props.branch ?? 'main';
    const qualifier = props.bootstrapQualifier ?? 'hnb659fds';

    const providerArn =
      props.existingOidcProviderArn ??
      new iam.OidcProviderNative(this, 'GitHubOidcProvider', {
        url: `https://${ISSUER}`,
        clientIds: [AUDIENCE],
      }).oidcProviderArn;

    const role = new iam.Role(this, 'DeployRole', {
      description: `GitHub Actions deploy role for ${props.repository}@${branch}`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          [`${ISSUER}:aud`]: AUDIENCE,
          [`${ISSUER}:sub`]: `repo:${props.repository}:ref:refs/heads/${branch}`,
        },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(
          (kind) =>
            `arn:${this.partition}:iam::${this.account}:role/cdk-${qualifier}-${kind}-role-${this.account}-${this.region}`,
        ),
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: role.roleArn,
      description: 'Set as the AWS_ROLE_ARN repository variable in GitHub',
    });
  }
}
