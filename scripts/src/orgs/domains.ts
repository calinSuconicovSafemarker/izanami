import { registrableDomain } from '../lib/domain';

/**
 * Paths that still denote the site itself: `/`, a locale (`/en/`, `/en-gb`) or an index page.
 * Deeper paths (`github.com/someproject`) are pages on someone else's platform and are ignored.
 */
const ROOTISH_PATH = /^\/(?:[a-z]{2}(?:[-_][a-z]{2})?\/?)?(?:index\.html?)?$/i;

/**
 * Registrable domain of a Wikidata P856 URL, or null when it is not that domain's own site root.
 * The host must be the registrable domain itself or its `www.`: `mail.google.com` (Gmail's P856)
 * does not make google.com Gmail's domain.
 */
export function officialDomainOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!ROOTISH_PATH.test(parsed.pathname)) return null;
  const domain = registrableDomain(parsed.hostname);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!domain || (host !== domain && host !== `www.${domain}`)) return null;
  return domain;
}

/** P856 spellings of a domain's homepage, used to look entities up by exact IRI. */
export function rootUrlsFor(domain: string): string[] {
  const urls: string[] = [];
  for (const scheme of ['https', 'http']) {
    for (const host of [domain, `www.${domain}`]) {
      urls.push(`${scheme}://${host}/`, `${scheme}://${host}`);
    }
  }
  return urls;
}
