import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/** Descriptive, personal-data-free User-Agent for every request this script makes. */
export const USER_AGENT =
  'lookalike-checker-build-data/0.1 (build-time dataset generator for a lookalike-domain checker; Node.js)';

/**
 * The one download cache for every build-data step (`scripts/.cache`, gitignored: the folder
 * ignores itself), so reruns are fast and reproducible.
 */
export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.cache');

/** Set `BUILD_DATA_REFRESH=1` to ignore cached downloads and fetch fresh data. */
const REFRESH = process.env.BUILD_DATA_REFRESH === '1';

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const ignore = join(CACHE_DIR, '.gitignore');
  if (!existsSync(ignore)) await writeFile(ignore, '*\n');
}

/** Returns the cached file `name` (may contain a sub-folder), or runs `produce` and caches it. */
export async function cached(name: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  await ensureCacheDir();
  const path = join(CACHE_DIR, name);
  await mkdir(dirname(path), { recursive: true });
  if (!REFRESH && existsSync(path)) return readFile(path);
  const data = await produce();
  await writeFile(path, data);
  return data;
}

/** GET with retries on 429/5xx, honouring Retry-After. */
export async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
      redirect: 'follow',
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 6) {
      throw new Error(`${init.method ?? 'GET'} ${url} failed: HTTP ${res.status}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15 * attempt;
    console.warn(`  HTTP ${res.status} from ${new URL(url).host}; retrying in ${waitSeconds}s`);
    await sleep(Math.min(waitSeconds, 120) * 1000);
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** GET `url` once, cached under its file name. */
export function cachedDownload(url: string): Promise<Buffer> {
  const name = new URL(url).pathname.split('/').pop() || 'download';
  return cached(name, () => fetchWithRetry(url));
}
