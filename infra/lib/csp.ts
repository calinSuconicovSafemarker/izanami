/**
 * Content-Security-Policy generation (ADR-0004).
 *
 * The connect-src allowlist is generated from the IANA RDAP bootstrap hosts, which makes the
 * header ~9 KB — far above the 1783-character limit CloudFront imposes on header values in a
 * ResponseHeadersPolicy. The CSP is therefore attached by a viewer-response CloudFront Function
 * whose source is generated here.
 */

/** Origins the browser calls besides the per-TLD RDAP servers. */
export const FIXED_CONNECT_ORIGINS = [
  'https://cloudflare-dns.com', // DoH
  'https://dns.google', // DoH
  'https://rdap.org', // RDAP fallback / redirector
  'https://data.iana.org', // RDAP bootstrap
  'https://crt.sh', // Certificate Transparency
] as const;

/** CloudFront Functions reject code larger than 10 KB. */
export const CLOUDFRONT_FUNCTION_MAX_BYTES = 10 * 1024;

const HTTPS_ORIGIN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/;

/**
 * `forMeta`: build the policy for a `<meta http-equiv>` tag (GitHub Pages can't set headers).
 * Browsers ignore `frame-ancestors` in a meta CSP and log a warning, so it is left out there.
 */
export function buildCsp(rdapHosts: readonly string[], opts: { forMeta?: boolean } = {}): string {
  for (const h of rdapHosts) {
    if (!HTTPS_ORIGIN.test(h)) throw new Error(`RDAP host is not a bare https origin: ${h}`);
  }
  const connect = [...new Set([...FIXED_CONNECT_ORIGINS, ...rdapHosts])].sort();
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ${connect.join(' ')}`,
    "object-src 'none'",
    ...(opts.forMeta ? [] : ["frame-ancestors 'none'"]),
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * Source for a cloudfront-js-2.0 viewer-response function that sets the CSP header.
 * `https://` prefixes are stripped and re-added at runtime to stay well under the size limit.
 */
export function cspFunctionCode(csp: string): string {
  const compact = csp.replaceAll(' https://', ' ~');
  if (compact.includes('"') || compact.includes('\\')) throw new Error('unexpected CSP characters');
  const code = [
    'function handler(event) {',
    '  var r = event.response;',
    `  r.headers['content-security-policy'] = { value: "${compact}".split(' ~').join(' https://') };`,
    '  return r;',
    '}',
  ].join('\n');
  if (Buffer.byteLength(code, 'utf8') >= CLOUDFRONT_FUNCTION_MAX_BYTES) {
    throw new Error('CSP CloudFront Function exceeds the 10 KB limit');
  }
  return code;
}
