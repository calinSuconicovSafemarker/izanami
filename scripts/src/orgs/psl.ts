import { domainToASCII } from 'node:url';

/** Parsed Public Suffix List: rule sets keyed by ASCII (punycode) suffix. */
export interface Psl {
  readonly rules: ReadonlySet<string>;
  readonly wildcards: ReadonlySet<string>;
  readonly exceptions: ReadonlySet<string>;
}

/** Parses `public_suffix_list.dat` text (ICANN + private sections). */
export function parsePsl(text: string): Psl {
  const rules = new Set<string>();
  const wildcards = new Set<string>();
  const exceptions = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().split(/\s/)[0] ?? '';
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('!')) exceptions.add(toAscii(line.slice(1)));
    else if (line.startsWith('*.')) wildcards.add(toAscii(line.slice(2)));
    else rules.add(toAscii(line));
  }
  return { rules, wildcards, exceptions };
}

function toAscii(domain: string): string {
  return domainToASCII(domain) || domain.toLowerCase();
}

/** Number of labels in the public suffix of `labels` (PSL algorithm, default rule `*`). */
function suffixLength(psl: Psl, labels: string[]): number {
  let best = 1;
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    const length = labels.length - i;
    if (psl.exceptions.has(candidate)) return length - 1;
    if (psl.rules.has(candidate)) best = Math.max(best, length);
    if (i > 0 && psl.wildcards.has(candidate)) best = Math.max(best, length + 1);
  }
  return best;
}

/** Registrable domain (eTLD+1) of a hostname, or null for suffixes, IPs and empty input. */
export function registrableDomain(psl: Psl, hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  const ascii = toAscii(host);
  if (!ascii) return null;
  const labels = ascii.split('.');
  if (labels.some((l) => l === '')) return null;
  const suffix = suffixLength(psl, labels);
  if (labels.length <= suffix) return null;
  return labels.slice(labels.length - suffix - 1).join('.');
}
