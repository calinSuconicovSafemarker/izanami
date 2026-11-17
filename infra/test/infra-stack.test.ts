import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { InfraStack } from '../lib/infra-stack';

describe('InfraStack', () => {
  it('synthesizes an empty skeleton stack', () => {
    const app = new App();
    const stack = new InfraStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    expect(Object.keys(template.toJSON().Resources ?? {})).toHaveLength(0);
  });
});
