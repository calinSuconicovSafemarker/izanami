import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Extracts the first entry of a zip archive (stored or deflated). Enough for the Tranco zip. */
export function unzipFirstFile(bytes: Uint8Array): Buffer {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file: end of central directory not found');
  const central = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(central) !== CENTRAL_SIGNATURE) throw new Error('Corrupt zip directory');
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const localOffset = zip.readUInt32LE(central + 42);
  if (zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error('Corrupt zip entry');
  const dataStart =
    localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const data = zip.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}`);
}
