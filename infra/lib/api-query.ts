/**
 * cloudfront-js-2.0 viewer-request function for `/api/*` (ticket 20, ADR-0006 Amendment 1).
 *
 * Runs before CloudFront computes the cache key, so spelling variants of the same check
 * (`GOOGLE.com`, `google.com.`, ` google.com`) share one cache entry instead of each running
 * the Lambda. It only normalises; the API's own validation stays authoritative:
 * - keeps only `org` and `domain` (the cache policy ignores the rest anyway);
 * - leaves a parameter untouched when it is repeated (the API answers 400) or can't be decoded;
 * - decodes, trims, lowercases, strips trailing dots from `domain`, and re-encodes.
 * Subdomains and IDNs are left alone: the analysis differs per subdomain, and punycode
 * conversion is too heavy for a CloudFront Function (the Lambda normalises those).
 */
export const API_QUERY_FUNCTION_CODE = [
  'function handler(event) {',
  '  var req = event.request;',
  '  var qs = req.querystring || {};',
  '  var out = {};',
  "  ['org', 'domain'].forEach(function (name) {",
  '    var p = qs[name];',
  '    if (!p) return;',
  '    if (p.multiValue && p.multiValue.length > 1) { out[name] = p; return; }',
  '    var v;',
  '    try { v = decodeURIComponent(p.value.replace(/\\+/g, " ")); } catch (e) { out[name] = p; return; }',
  '    v = v.trim().toLowerCase();',
  "    if (name === 'domain') v = v.replace(/\\.+$/, '');",
  '    out[name] = { value: encodeURIComponent(v) };',
  '  });',
  '  req.querystring = out;',
  '  return req;',
  '}',
].join('\n');
