import { pathToFileURL } from 'node:url';

/** Build-time data generator. Filled in by tickets 01 and 02. */
export async function buildData(): Promise<void> {
  // Intentionally empty for the scaffold.
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  buildData().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
