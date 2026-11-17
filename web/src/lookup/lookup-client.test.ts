import { FixtureLookupClient } from './fixture-client';

const client = new FixtureLookupClient();

describe('dns', () => {
  it('returns A records for a resolving domain', async () => {
    expect(await client.dns('tudelft.nl', 'A')).toEqual({
      status: 'ok',
      name: 'tudelft.nl',
      type: 'A',
      records: ['130.161.128.82'],
    });
  });
});

describe('dns NXDOMAIN', () => {
  it('maps DoH Status 3 to not-found with no records', async () => {
    expect(await client.dns('tudelft-lookalike-xq7z.nl', 'NS')).toEqual({
      status: 'not-found',
      name: 'tudelft-lookalike-xq7z.nl',
      type: 'NS',
      records: [],
    });
  });
});

describe('dns record data', () => {
  it('unquotes TXT records and joins their chunks', async () => {
    const { records } = await client.dns('tudelft.nl', 'TXT');
    expect(records).toContain('MS=ms66592311');
    const spf = records.find((r) => r.startsWith('v=spf1'));
    expect(spf).toMatch(
      /include:spf\.recruitmail\.com ip4:46\.31\.48\.0\/21 include:spf\.topdesk\.net/,
    );
    expect(spf).toMatch(/dataduiker\.app ~all$/);
  });

  it('strips the trailing dot from NS host names', async () => {
    const { records } = await client.dns('google.com', 'NS');
    expect(records.sort()).toEqual([
      'ns1.google.com',
      'ns2.google.com',
      'ns3.google.com',
      'ns4.google.com',
    ]);
  });
});

describe('rdap', () => {
  it('parses registration date, registrar and nameservers, hiding a redacted registrant', async () => {
    expect(await client.rdap('tudelft.nl')).toEqual({
      status: 'ok',
      domain: 'tudelft.nl',
      registered: true,
      registrationDate: '1987-07-23T00:00:00Z',
      registrar: 'Technische Universiteit Delft',
      nameservers: [
        'ns1.surfnet.nl',
        'ns2.surfnet.nl',
        'ns1.tudelft.nl',
        'ns2.tudelft.nl',
        'ns1.zurich.surf.net',
      ],
    });
  });

  it('lower-cases nameservers from a thin .com registry', async () => {
    expect(await client.rdap('google.com')).toEqual({
      status: 'ok',
      domain: 'google.com',
      registered: true,
      registrationDate: '1997-09-15T04:00:00Z',
      registrar: 'MarkMonitor Inc.',
      nameservers: ['ns1.google.com', 'ns2.google.com', 'ns3.google.com', 'ns4.google.com'],
    });
  });

  it('maps a registry 404 to not registered', async () => {
    expect(await client.rdap('tudelft-lookalike-xq7z.nl')).toEqual({
      status: 'not-found',
      domain: 'tudelft-lookalike-xq7z.nl',
      registered: false,
      nameservers: [],
    });
  });

  it('uses rdap.org for a TLD missing from the base-URL map', async () => {
    expect(await client.rdap('tudelft-lookalike-xq7z.guide')).toMatchObject({
      status: 'not-found',
      registered: false,
    });
  });
});

describe('asn', () => {
  it('looks up the origin AS of an IPv4 address via Team Cymru', async () => {
    expect(await client.asn('130.161.128.82')).toEqual({
      status: 'ok',
      ip: '130.161.128.82',
      asn: 1128,
      prefix: '130.161.0.0/16',
      country: 'NL',
    });
  });

  it('looks up the origin AS of a compressed IPv6 address', async () => {
    expect(await client.asn('2a00:1450:400e:804::200e')).toMatchObject({
      status: 'ok',
      asn: 15169,
    });
  });

  it('is unavailable when the lookup fails', async () => {
    expect(await client.asn('192.0.2.1')).toEqual({ status: 'unavailable', ip: '192.0.2.1' });
  });
});

describe('certs', () => {
  it('lists Certificate Transparency entries oldest first', async () => {
    const result = await client.certs('tudelft.nl');
    expect(result.status).toBe('ok');
    expect(result.certs).toHaveLength(10);
    expect(result.certs[0]).toEqual({
      commonName: 'gatekeeper.tudelft.nl',
      issuer: 'C=BE, O=Cybertrust, OU=Educational CA, CN=Cybertrust Educational CA',
      notBefore: '2006-07-17T14:53:54Z',
      notAfter: '2009-07-17T14:53:54Z',
    });
    expect(result.certs.at(-1)?.notBefore).toBe('2019-10-02T23:35:55Z');
  });

  it('is unavailable instead of throwing when crt.sh fails', async () => {
    expect(await client.certs('google.com')).toEqual({
      status: 'unavailable',
      domain: 'google.com',
      certs: [],
    });
  });
});
