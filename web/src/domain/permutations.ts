import { toASCII } from 'punycode/';

/** How a candidate was derived from the brand label (dnstwist-style). */
export type PermutationTechnique =
  | 'tld-swap'
  | 'omission'
  | 'repetition'
  | 'transposition'
  | 'replacement'
  | 'homoglyph'
  | 'hyphenation'
  | 'combo';

export interface Candidate {
  /** ASCII/punycode hostname, ready for DNS. */
  domain: string;
  /** Unicode form for display (equals `domain` unless it is an IDN). */
  display: string;
  technique: PermutationTechnique;
  tld: string;
}

export interface PermutationInput {
  /** Registrable label of the primary domain (`google`). */
  brandLabel: string;
  /** TLD the typo permutations are generated on (`com`). */
  primaryTld: string;
  /** TLDs the brand label is swapped onto. */
  tlds: readonly string[];
  /** Never returned as candidates. */
  officialDomains: readonly string[];
  /** Upper bound on candidates; default 150. */
  limit?: number;
}

export const DEFAULT_PERMUTATION_LIMIT = 150;

/** QWERTY neighbours of each key. */
const KEYBOARD: Record<string, string> = {
  q: 'wa',
  w: 'qeas',
  e: 'wrsd',
  r: 'etdf',
  t: 'ryfg',
  y: 'tugh',
  u: 'yihj',
  i: 'uojk',
  o: 'ipkl',
  p: 'ol',
  a: 'qwsz',
  s: 'awedxz',
  d: 'serfcx',
  f: 'drtgvc',
  g: 'ftyhbv',
  h: 'gyujnb',
  j: 'huikmn',
  k: 'jiolm',
  l: 'kop',
  z: 'asx',
  x: 'zsdc',
  c: 'xdfv',
  v: 'cfgb',
  b: 'vghn',
  n: 'bhjm',
  m: 'njk',
  '1': '2q',
  '2': '13qw',
  '3': '24we',
  '4': '35er',
  '5': '46rt',
  '6': '57ty',
  '7': '68yu',
  '8': '79ui',
  '9': '80io',
  '0': '9op',
};

/** Single-character lookalikes: ASCII first, then Cyrillic/Greek (IDN homographs). */
const HOMOGLYPHS: Record<string, string[]> = {
  o: ['0', 'о'],
  l: ['1', 'i'],
  i: ['1', 'l', 'і'],
  e: ['3', 'е'],
  a: ['4', 'а'],
  s: ['5', 'ѕ'],
  g: ['q'],
  q: ['g'],
  b: ['6'],
  c: ['с'],
  p: ['р'],
  x: ['х'],
  y: ['у'],
  m: ['rn'],
  w: ['vv'],
  d: ['cl'],
  '0': ['o'],
  '1': ['l'],
};

const COMBO_WORDS = ['login', 'secure', 'support', 'account', 'verify', 'help'] as const;

const unique = (xs: string[]) => [...new Set(xs)];

function omissions(label: string): string[] {
  return unique([...label].map((_, i) => label.slice(0, i) + label.slice(i + 1)));
}

function repetitions(label: string): string[] {
  return unique([...label].map((ch, i) => label.slice(0, i) + ch + label.slice(i)));
}

function transpositions(label: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < label.length - 1; i++) {
    if (label.charAt(i) === label.charAt(i + 1)) continue;
    out.push(label.slice(0, i) + label.charAt(i + 1) + label.charAt(i) + label.slice(i + 2));
  }
  return unique(out);
}

function replacements(label: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < label.length; i++)
    for (const k of KEYBOARD[label.charAt(i)] ?? '')
      out.push(label.slice(0, i) + k + label.slice(i + 1));
  return unique(out);
}

function homoglyphs(label: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < label.length; i++)
    for (const h of HOMOGLYPHS[label.charAt(i)] ?? [])
      out.push(label.slice(0, i) + h + label.slice(i + 1));
  return unique(out);
}

function hyphenations(label: string): string[] {
  const out: string[] = [];
  for (let i = 1; i < label.length; i++) out.push(`${label.slice(0, i)}-${label.slice(i)}`);
  return out;
}

function combos(label: string): string[] {
  return COMBO_WORDS.flatMap((w) => [`${label}-${w}`, `${w}-${label}`]);
}

const TYPO_TECHNIQUES: [PermutationTechnique, (label: string) => string[]][] = [
  ['omission', omissions],
  ['repetition', repetitions],
  ['transposition', transpositions],
  ['replacement', replacements],
  ['homoglyph', homoglyphs],
  ['hyphenation', hyphenations],
  ['combo', combos],
];

const LDH_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function toCandidate(
  label: string,
  tld: string,
  technique: PermutationTechnique,
): Candidate | undefined {
  const display = `${label}.${tld}`;
  let domain: string;
  try {
    domain = toASCII(display);
  } catch {
    return undefined;
  }
  const asciiLabel = domain.split('.')[0] ?? '';
  if (!LDH_LABEL.test(asciiLabel)) return undefined;
  // `ab--` is reserved for IDNA A-labels.
  if (asciiLabel.slice(2, 4) === '--' && !asciiLabel.startsWith('xn--')) return undefined;
  return { domain, display, technique, tld };
}

/**
 * Lookalike candidates for a brand: the label on other TLDs plus typo permutations on the
 * primary TLD. Pure and deterministic. Techniques are interleaved round-robin so a tight
 * `limit` still covers every technique; duplicates and official domains are dropped.
 */
export function generatePermutations(input: PermutationInput): Candidate[] {
  const label = input.brandLabel.toLowerCase();
  const primaryTld = input.primaryTld.toLowerCase();
  const limit = input.limit ?? DEFAULT_PERMUTATION_LIMIT;
  const excluded = new Set(input.officialDomains.map((d) => d.toLowerCase()));
  excluded.add(`${label}.${primaryTld}`);

  const queues: Candidate[][] = [
    input.tlds.flatMap((t) => toCandidate(label, t.toLowerCase(), 'tld-swap') ?? []),
    ...TYPO_TECHNIQUES.map(([technique, gen]) =>
      gen(label).flatMap((l) => (l === label ? [] : (toCandidate(l, primaryTld, technique) ?? []))),
    ),
  ];

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (let round = 0; out.length < limit && queues.some((q) => round < q.length); round++) {
    for (const queue of queues) {
      const c = queue[round];
      if (!c || out.length >= limit) continue;
      if (seen.has(c.domain) || excluded.has(c.domain) || excluded.has(c.display)) continue;
      seen.add(c.domain);
      out.push(c);
    }
  }
  return out;
}
