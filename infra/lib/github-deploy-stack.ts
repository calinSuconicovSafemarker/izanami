import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const ISSUER = 'token.actions.githubusercontent.com';
const AUDIENCE = 'sts.amazonaws.com';
const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface GitHubDeployStackProps extends StackProps {
  /** GitHub repository allowed to deploy, as `owner/name`. */
  readonly repository: string;
  /**
   * GitHub environment allowed to deploy. Default `aws-deploy`. Only a job that
   * declares `environment: <name>` gets an OIDC token whose `sub` matches, so
   * protect that environment in the repo settings (e.g. deployment branches: `main`).
   */
  readonly environment?: string;
  /** CDK bootstrap qualifier. Default `hnb659fds` (the CDK default). */
  readonly bootstrapQualifier?: string;
  /** ARN of an existing GitHub OIDC provider in the account (only one may exist per URL). */
  readonly existingOidcProviderArn?: string;
}

/**
 * GitHub Actions OIDC provider plus a deploy role that only jobs running in the
 * given repo's protected environment can assume, and that can do nothing except
 * assume the CDK bootstrap roles.
 */
export class GitHubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props: GitHubDeployStackProps) {
    super(scope, id, props);
    if (!REPO_PATTERN.test(props.repository)) {
      throw new Error(`repository must be "owner/name", got "${props.repository}"`);
    }
    const environment = props.environment ?? 'aws-deploy';
    if (!ENVIRONMENT_PATTERN.test(environment)) {
      throw new Error(`environment must match ${ENVIRONMENT_PATTERN}, got "${environment}"`);
    }
    const qualifier = props.bootstrapQualifier ?? 'hnb659fds';

    const providerArn =
      props.existingOidcProviderArn ??
      new iam.OidcProviderNative(this, 'GitHubOidcProvider', {
        url: `https://${ISSUER}`,
        clientIds: [AUDIENCE],
      }).oidcProviderArn;

    const role = new iam.Role(this, 'DeployRole', {
      description: `GitHub Actions deploy role for ${props.repository} (environment ${environment})`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          [`${ISSUER}:aud`]: AUDIENCE,
          [`${ISSUER}:sub`]: `repo:${props.repository}:environment:${environment}`,
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
