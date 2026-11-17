import { describe, expect, it } from 'vitest';
import rdapHosts from '../../web/src/data/rdap-hosts.json';
import { buildCsp, cspFunctionCode, CLOUDFRONT_FUNCTION_MAX_BYTES } from '../lib/csp';

type CfEvent = { response: { headers: Record<string, { value: string }> } };

/** Runs generated CloudFront Function source the way the runtime does: call handler(event). */
function runFunction(code: string, event: CfEvent): CfEvent['response'] {
  return new Function(`${code}\nreturn handler;`)()(event);
}

function directive(csp: string, name: string): string[] {
  const d = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name} `));
  return d ? d.split(/\s+/).slice(1) : [];
}

describe('buildCsp', () => {
  const sample = ['https://rdap.nic.example', 'https://rdap.org', 'https://rdap.nic.example'];

  it('locks everything down to self except the network allowlist', () => {
    const csp = buildCsp(sample);
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'script-src')).toEqual(["'self'"]);
    expect(directive(csp, 'style-src')).toEqual(["'self'"]);
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:']);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'none'"]);
    expect(directive(csp, 'form-action')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
  });

  it('allows DoH, rdap.org, IANA, crt.sh and each RDAP host exactly once', () => {
    const connect = directive(buildCsp(sample), 'connect-src');
    expect(connect).toEqual([
      "'self'",
      'https://cloudflare-dns.com',
      'https://crt.sh',
      'https://data.iana.org',
      'https://dns.google',
      'https://rdap.nic.example',
      'https://rdap.org',
    ]);
  });

  it('rejects anything that is not a bare https origin', () => {
    expect(() => buildCsp(['http://rdap.example'])).toThrow(/https origin/);
    expect(() => buildCsp(['https://rdap.example/path'])).toThrow(/https origin/);
    expect(() => buildCsp(["https://x.example 'unsafe-inline'"])).toThrow(/https origin/);
  });
});

describe('cspFunctionCode', () => {
  it('adds the CSP header on viewer response without touching other headers', () => {
    const csp = buildCsp(['https://rdap.nic.example']);
    const res = runFunction(cspFunctionCode(csp), {
      response: { headers: { 'content-type': { value: 'text/html' } } },
    });
    expect(res.headers['content-security-policy']?.value).toBe(csp);
    expect(res.headers['content-type']?.value).toBe('text/html');
  });

  it('carries the full generated allowlist within the CloudFront Function size limit', () => {
    const csp = buildCsp(rdapHosts.hosts);
    const code = cspFunctionCode(csp);
    expect(Buffer.byteLength(code, 'utf8')).toBeLessThan(CLOUDFRONT_FUNCTION_MAX_BYTES);
    const res = runFunction(code, { response: { headers: {} } });
    const connect = directive(res.headers['content-security-policy']!.value, 'connect-src');
    for (const host of rdapHosts.hosts) expect(connect).toContain(host);
    expect(connect).toContain('https://dns.google');
  });
});
