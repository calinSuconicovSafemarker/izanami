// Hits real endpoints. Run with `npm run test:live -w web`; excluded from `npm test` / CI.
import { createLookupClient } from './index';

const client = createLookupClient({ rdapBaseUrls: { nl: 'https://rdap.sidn.nl/' } });

describe('live lookups for tudelft.nl', () => {
  it('resolves A and NS records over DoH', async () => {
    const a = await client.dns('tudelft.nl', 'A');
    expect(a.status).toBe('ok');
    expect(a.records.length).toBeGreaterThan(0);
    const ns = await client.dns('tudelft.nl', 'NS');
    expect(ns.records.some((r) => r.endsWith('tudelft.nl') || r.includes('surf'))).toBe(true);
  });

  it('reports NXDOMAIN for a made-up name', async () => {
    expect((await client.dns('tudelft-lookalike-xq7z.nl', 'A')).status).toBe('not-found');
  });

  it('reads the SIDN RDAP record', async () => {
    const rdap = await client.rdap('tudelft.nl');
    expect(rdap).toMatchObject({ status: 'ok', registered: true });
    expect(rdap.registrationDate).toMatch(/^1987-07-23/);
    expect(rdap.nameservers.length).toBeGreaterThan(0);
    expect(rdap.registrant).toBeUndefined();
  });

  it('finds the origin AS of its web server', async () => {
    const [ip] = (await client.dns('tudelft.nl', 'A')).records;
    const asn = await client.asn(ip!);
    expect(asn.status).toBe('ok');
    expect(asn.asn).toBeGreaterThan(0);
  });

  it('never throws on crt.sh (ok or unavailable)', async () => {
    const certs = await client.certs('tudelft.nl');
    expect(['ok', 'unavailable']).toContain(certs.status);
  }, 10_000);
});
