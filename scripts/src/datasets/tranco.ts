import { inflateRawSync } from 'node:zlib';

/** Extracts the first file of a zip archive (stored or deflate), using the central directory. */
function unzipFirstEntry(zip: Uint8Array): Buffer {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Tranco download is not a zip file');
  const cd = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cd + 10);
  const compressedSize = buf.readUInt32LE(cd + 20);
  const localOffset = buf.readUInt32LE(cd + 42);
  const dataStart =
    localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
  const data = buf.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}`);
}

/** Returns the top `n` domains (lowercase, rank order) from the Tranco `top-1m.csv.zip`. */
export function trancoTopDomains(zip: Uint8Array, n: number): string[] {
  const csv = unzipFirstEntry(zip).toString('utf8');
  const domains: string[] = [];
  for (const line of csv.split('\n')) {
    if (domains.length >= n) break;
    const domain = line.split(',')[1]?.trim().toLowerCase();
    if (domain) domains.push(domain);
  }
  return domains;
}
