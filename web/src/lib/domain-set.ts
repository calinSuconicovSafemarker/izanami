/**
 * Compact, read-only domain membership set.
 *
 * Each domain is hashed to 32 bits (FNV-1a); the sorted unique hashes are
 * stored as Golomb-Rice coded gaps (~17 bits per domain for 100k domains).
 * Lookups are exact on hashes, so the only error is a hash collision:
 * false-positive rate ≈ n / 2^32 (≈ 2.3e-5 for 100k domains). No false negatives.
 */

export interface EncodedDomainSet {
  /** Format version. */
  v: 1;
  /** Rice parameter: remainder bit width. */
  k: number;
  /** Number of unique hashes. */
  n: number;
  /** Base64 of the Rice-coded bitstream. */
  data: string;
}

export interface DomainSet {
  readonly size: number;
  has(domain: string): boolean;
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

function hashDomain(domain: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < domain.length; i++) {
    h ^= domain.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function encodeDomainSet(domains: Iterable<string>): EncodedDomainSet {
  const hashes = [...new Set([...domains].map((d) => hashDomain(normalizeDomain(d))))].sort(
    (a, b) => a - b,
  );
  const n = hashes.length;
  const max = n > 0 ? hashes[n - 1]! : 0;
  const k = n > 0 ? Math.max(0, Math.floor(Math.log2(Math.max(1, max / n)))) : 0;
  const pow = 2 ** k;

  const bytes: number[] = [];
  let cur = 0;
  let bits = 0;
  const writeBit = (bit: number) => {
    cur = (cur << 1) | bit;
    if (++bits === 8) {
      bytes.push(cur);
      cur = 0;
      bits = 0;
    }
  };

  let prev = 0;
  for (const h of hashes) {
    const gap = h - prev;
    prev = h;
    const q = Math.floor(gap / pow);
    const r = gap % pow;
    for (let i = 0; i < q; i++) writeBit(1);
    writeBit(0);
    for (let i = k - 1; i >= 0; i--) writeBit(Math.floor(r / 2 ** i) % 2);
  }
  if (bits > 0) bytes.push(cur << (8 - bits));

  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return { v: 1, k, n, data: btoa(binary) };
}

export function decodeDomainSet(encoded: EncodedDomainSet): DomainSet {
  const { k, n } = encoded;
  const binary = atob(encoded.data);
  const hashes = new Uint32Array(n);
  const pow = 2 ** k;

  let pos = 0;
  const readBit = () => {
    const byte = binary.charCodeAt(pos >>> 3);
    const bit = (byte >>> (7 - (pos & 7))) & 1;
    pos++;
    return bit;
  };

  let prev = 0;
  for (let i = 0; i < n; i++) {
    let q = 0;
    while (readBit() === 1) q++;
    let r = 0;
    for (let b = 0; b < k; b++) r = r * 2 + readBit();
    prev += q * pow + r;
    hashes[i] = prev;
  }

  return {
    size: n,
    has(domain: string): boolean {
      const h = hashDomain(normalizeDomain(domain));
      let lo = 0;
      let hi = n - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const v = hashes[mid]!;
        if (v === h) return true;
        if (v < h) lo = mid + 1;
        else hi = mid - 1;
      }
      return false;
    },
  };
}
