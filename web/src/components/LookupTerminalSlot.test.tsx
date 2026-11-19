import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DnsResult, DnsType, RdapResult } from '../lookup';
import { FixtureLookupClient } from '../lookup/fixture-client';
import { renderRoute } from '../test/render-route';

const terminal = () => screen.getByRole('region', { name: /lookup terminal/i });
const output = () => within(terminal()).getByRole('log', { name: /lookup output/i });
const resultLine = (source: string) =>
  within(output())
    .getAllByRole('listitem')
    .find((li) => li.firstElementChild?.textContent === source);
const input = () => within(terminal()).getByRole('textbox', { name: /domain to check/i });

/** Recorded fixtures, plus a domain that is registered (RDAP 200) but has no DNS records. */
class ParkedDomainClient extends FixtureLookupClient {
  override async dns(name: string, type: DnsType): Promise<DnsResult> {
    if (name === 'tudelft-parked.nl') return { status: 'ok', name, type, records: [] };
    return super.dns(name, type);
  }
  override async rdap(domain: string): Promise<RdapResult> {
    if (domain === 'tudelft-parked.nl')
      return {
        status: 'ok',
        domain,
        registered: true,
        registrationDate: '2026-11-01T00:00:00Z',
        registrar: 'Example Registrar B.V.',
        nameservers: [],
      };
    return super.rdap(domain);
  }
}

describe('lookup terminal', () => {
  it('runs a deep-linked lookup without user action: NXDOMAIN + RDAP 404 is not registered', async () => {
    renderRoute('/org/tu-delft?d=tudelft-lookalike-xq7z.nl');
    expect(
      await within(output()).findByText('Not registered — no active threat right now.'),
    ).toBeInTheDocument();
    expect(input()).toHaveValue('tudelft-lookalike-xq7z.nl');
    expect(resultLine('A')).toHaveTextContent('NXDOMAIN');
    expect(resultLine('RDAP')).toHaveTextContent('not registered (404)');
  });

  it('shows registered-but-not-resolving when RDAP finds the domain and DNS has no records', async () => {
    renderRoute('/org/tu-delft?d=tudelft-parked.nl', new ParkedDomainClient());
    expect(
      await within(output()).findByText('Registered but not live yet — worth watching.'),
    ).toBeInTheDocument();
    expect(resultLine('RDAP')).toHaveTextContent('2026-11-01');
    expect(resultLine('NS')).toHaveTextContent('no records');
  });

  it('shows a resolving domain with its IP, registration date, registrar and MX', async () => {
    renderRoute('/org/tu-delft?d=google.com');
    expect(await within(output()).findByText(/^Resolving/)).toBeInTheDocument();
    expect(resultLine('A')).toHaveTextContent('192.178.24.142');
    expect(resultLine('MX')).toHaveTextContent('smtp.google.com');
    expect(resultLine('RDAP')).toHaveTextContent('1997-09-15');
    expect(resultLine('RDAP')).toHaveTextContent('MarkMonitor Inc.');
    expect(resultLine('TXT')).toHaveTextContent('v=spf1 include:_spf.google.com ~all');
    expect(resultLine('TXT')).not.toHaveTextContent('docusign');
    expect(resultLine('TXT')).toHaveTextContent(/\+\d+ other records/);
  });

  it('shows the punycode form of an IDN homoglyph', async () => {
    renderRoute('/org/tu-delft?d=tudеlft.nl', new FixtureLookupClient(['tudelft.nl']));
    expect(await within(output()).findByText('xn--tudlft-5of.nl')).toBeInTheDocument();
    expect(within(output()).getAllByText('tudеlft.nl').length).toBeGreaterThan(0);
  });

  it("renders unavailable sources as couldn't-check lines, not errors", async () => {
    // No recordings for this variant: every lookup fails like a network error.
    renderRoute('/org/tu-delft?d=tudelft-offline.nl', new FixtureLookupClient(['tudelft.nl']));
    expect(await within(output()).findByText(/couldn.t tell whether/i)).toBeInTheDocument();
    for (const source of ['NS', 'A', 'AAAA', 'MX', 'TXT', 'RDAP'])
      expect(resultLine(source)).toHaveTextContent("couldn't check");
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('runs a typed variant on submit and puts it in the URL', async () => {
    const router = renderRoute('/org/tu-delft');
    fireEvent.change(input(), { target: { value: 'tudelft-lookalike-xq7z.nl' } });
    fireEvent.click(within(terminal()).getByRole('button', { name: 'Check' }));
    expect(await within(output()).findByText(/^Not registered/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?d=tudelft-lookalike-xq7z.nl');
  });

  it('fills the input from a TLD chip, keeping the typed label', () => {
    renderRoute('/org/tu-delft');
    const chips = within(terminal()).getByRole('list', { name: /quick tlds/i });
    expect(within(chips).getAllByRole('button')[0]).toHaveTextContent('.nl');
    fireEvent.change(input(), { target: { value: 'tudelft-login.nl' } });
    fireEvent.click(within(chips).getByRole('button', { name: /^\.xyz / }));
    expect(input()).toHaveValue('tudelft-login.xyz');
  });

  it('stops at "Official domain" for a known official domain, without lookups', async () => {
    renderRoute('/org/tu-delft?d=tudelft.nl', new FixtureLookupClient([]));
    expect(await within(output()).findByText(/^Official domain/)).toBeInTheDocument();
    expect(within(output()).queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows Unicode and punycode forms and flags subdomain tricks', async () => {
    renderRoute('/org/tu-delft?d=tudelft.nl.tudelft-lookalike-xq7z.nl');
    expect(
      await within(output()).findByText(
        /You typed tudelft\.nl\.tudelft-lookalike-xq7z\.nl — the registrable domain is tudelft-lookalike-xq7z\.nl/,
      ),
    ).toBeInTheDocument();
    expect(output()).toHaveTextContent('unicode');
    expect(output()).toHaveTextContent('puny');
  });

  it('says so for input that is not a domain', async () => {
    renderRoute('/org/tu-delft?d=not a domain');
    expect(await within(output()).findByText(/not a valid domain/)).toBeInTheDocument();
  });
});

describe('verdict card', () => {
  const verdictCard = () => screen.queryByRole('region', { name: /^verdict$/i });

  it('announces the final verdict once every lookup settles', async () => {
    renderRoute('/org/tu-delft?d=google.com');
    const status = within((await screen.findByRole('region', { name: /^verdict$/i }))!).getByRole(
      'status',
    );
    expect(await within(status).findByText(/^Verdict: /)).toBeInTheDocument();
    // google.com has no crt.sh recording: the CT check is listed as couldn't-check.
    const unknown = within(verdictCard()!).getByRole('list', { name: /couldn.t check/i });
    expect(unknown).toHaveTextContent('Certificate Transparency history (crt.sh) unavailable.');
  });

  it('shows no verdict for an unregistered variant', async () => {
    renderRoute('/org/tu-delft?d=tudelft-lookalike-xq7z.nl');
    expect(await within(output()).findByText(/^Not registered/)).toBeInTheDocument();
    expect(verdictCard()).not.toBeInTheDocument();
  });

  it('shows Official for a known official domain', async () => {
    renderRoute('/org/tu-delft?d=tudelft.nl', new FixtureLookupClient([]));
    const card = await screen.findByRole('region', { name: /^verdict$/i });
    expect(within(card).getByRole('status')).toHaveTextContent('Verdict: Official');
  });
});

describe('TLD ratings', () => {
  const chips = () =>
    within(within(terminal()).getByRole('list', { name: /quick tlds/i })).getAllByRole('button');
  const chip = (tld: string) => chips().find((b) => b.textContent?.startsWith(`.${tld}`))!;

  it("leads with the org's country TLD and the generic TLDs, high-abuse last", () => {
    renderRoute('/org/tu-delft');
    expect(chips().map((b) => b.textContent?.split(' ')[0]?.replace(/[^.a-z]/g, ''))).toEqual([
      '.nl',
      '.com',
      '.net',
      '.org',
      '.info',
      '.xyz',
      '.top',
      '.online',
      '.shop',
    ]);
  });

  it('shows each chip rating as text', () => {
    renderRoute('/org/tu-delft');
    expect(chip('nl')).toHaveTextContent('official');
    expect(chip('com')).toHaveTextContent('generic');
    expect(chip('xyz')).toHaveAccessibleName('.xyz high-abuse TLD');
  });

  it("names the country on a ccTLD chip that isn't official", () => {
    renderRoute('/org/microsoft');
    expect(chip('us')).toHaveTextContent('country · United States');
  });

  it('shows the rating of the looked-up TLD in the output', async () => {
    renderRoute('/org/tu-delft?d=tudelft-lookalike-xq7z.guide');
    expect(await within(output()).findByText('TLD .guide: other gTLD')).toBeInTheDocument();
  });
});
