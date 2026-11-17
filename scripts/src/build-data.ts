import { pathToFileURL } from 'node:url';
import { buildDatasets } from './datasets/index';

/** Build-time data generator. Filled in by tickets 01 and 02. */
export async function buildData(): Promise<void> {
  await buildDatasets();
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  buildData().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
