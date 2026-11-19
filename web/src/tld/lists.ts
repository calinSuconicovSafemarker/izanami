// TLD reference lists and the ISO ↔ ccTLD mapping (S3). Pure: no imports from the UI or rules,
// so the rules engine can use it too.

/** Legacy generic TLDs, open or restricted: never "odd" for any organisation. */
export const GENERIC_TLDS = [
  'com',
  'net',
  'org',
  'info',
  'biz',
  'name',
  'pro',
  'edu',
  'gov',
  'int',
  'mil',
  'mobi',
] as const;

/**
 * TLDs over-represented in phishing/abuse reports (Spamhaus, Interisle). Only these can fire
 * `odd-tld`, and they rate as `high-abuse`.
 */
export const ABUSE_HEAVY_TLDS = [
  'xyz',
  'top',
  'icu',
  'buzz',
  'club',
  'online',
  'site',
  'shop',
  'live',
  'click',
  'link',
  'cfd',
  'sbs',
  'bond',
  'cyou',
  'rest',
  'monster',
  'quest',
  'work',
  'support',
  'zip',
  'mov',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
] as const;

const abuse = new Set<string>(ABUSE_HEAVY_TLDS);
const generic = new Set<string>(GENERIC_TLDS);

/** `tld` (lower case, no dot) is on the abuse-heavy list. */
export const isAbuseHeavy = (tld: string) => abuse.has(tld);

/** `tld` (lower case, no dot) is a legacy generic TLD. */
export const isGeneric = (tld: string) => generic.has(tld);

/** ccTLDs whose ISO 3166-1 alpha-2 code differs from the TLD. */
const CC_TO_ISO: Readonly<Record<string, string>> = { uk: 'GB' };
const ISO_TO_CC: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CC_TO_ISO).map(([cc, iso]) => [iso, cc]),
);

/** ISO 3166-1 alpha-2 → ccTLD (`NL` → `nl`, `GB` → `uk`). */
export const ccTld = (iso: string) => ISO_TO_CC[iso.toUpperCase()] ?? iso.toLowerCase();

/** ccTLD → ISO 3166-1 alpha-2 (`nl` → `NL`, `uk` → `GB`). */
export const isoOfCcTld = (cc: string) => CC_TO_ISO[cc.toLowerCase()] ?? cc.toUpperCase();
