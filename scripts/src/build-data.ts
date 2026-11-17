import { pathToFileURL } from 'node:url';
import { buildDatasets } from './datasets/index';
import { buildOrgs } from './orgs';

/** Build-time data generator. Each ticket adds one step. */
export async function buildData(): Promise<void> {
  await buildOrgs();
  await buildDatasets();
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  buildData().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
