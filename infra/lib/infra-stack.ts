import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/** Skeleton stack. Resources are added in ticket 09. */
export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
