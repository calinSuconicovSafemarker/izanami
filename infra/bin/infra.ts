#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteDir = join(root, 'web', 'dist');
if (!existsSync(join(siteDir, 'index.html'))) {
  throw new Error(`${siteDir} has no index.html — run \`npm run build -w web\` first.`);
}
const { hosts } = JSON.parse(
  readFileSync(join(root, 'web', 'src', 'data', 'rdap-hosts.json'), 'utf8'),
) as { hosts: string[] };

const app = new App();
new InfraStack(app, 'LookalikeCheckerStack', { siteDir, rdapHosts: hosts });
