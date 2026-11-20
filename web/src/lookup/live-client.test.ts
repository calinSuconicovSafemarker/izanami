import { FIXTURES, fixtureFetch } from './fixture-client';
import { LiveLookupClient, MAX_BODY_BYTES } from './live-client';
import type { FetchLike } from './types';

const tudelft = fixtureFetch([FIXTURES['tudelft.nl']!]);

const failing =
  (pattern: RegExp, inner: FetchLike): FetchLike =>
  (input, init) =>
    pattern.test(input) ? Promise.reject(new TypeError('Failed to fetch')) : inner(input, init);

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('DoH fallback', () => {
  it('falls back to Google when Cloudflare fails', async () => {
    const client = new LiveLookupClient({ fetch: failing(/cloudflare-dns/, tudelft) });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
  });

  it('falls back to Google when Cloudflare answers SERVFAIL', async () => {
    const fetch: FetchLike = (input, init) =>
      /cloudflare-dns/.test(input) ? json({ Status: 2 }) : tudelft(input, init);
    const client = new LiveLookupClient({ fetch });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
  });

  it('is unavailable when both resolvers fail', async () => {
    const client = new LiveLookupClient({ fetch: () => json({ error: 'nope' }, 500) });
    expect(await client.dns('tudelft.nl', 'A')).toEqual({
      status: 'unavailable',
      name: 'tudelft.nl',
      type: 'A',
      records: [],
    });
  });
});

describe('rdap', () => {
  const vcard = (fn: string) => [
    'vcard',
    [
      ['version', {}, 'text', '4.0'],
      ['fn', {}, 'text', fn],
    ],
  ];
  const rdapBody = (registrantFn: string, redacted: unknown[] = []) => ({
    entities: [{ roles: ['registrant'], vcardArray: vcard(registrantFn) }],
    redacted,
  });
  const clientServing = (body: unknown, status = 200) =>
    new LiveLookupClient({
      fetch: () => json(body, status),
      rdapBaseUrls: { example: 'https://rdap.example' },
    });

  it('returns the registrant when the registry publishes it', async () => {
    const result = await clientServing(rdapBody('Acme B.V.')).rdap('acme.example');
    expect(result.registrant).toBe('Acme B.V.');
  });

  it('hides a registrant name flagged by an RFC 9537 redaction marker', async () => {
    const body = rdapBody('Jane Doe', [{ name: { description: 'Registrant Name' } }]);
    const result = await clientServing(body).rdap('acme.example');
    expect(result.registrant).toBeUndefined();
  });

  it('builds the request URL from the injected base-URL map', async () => {
    const seen: string[] = [];
    const client = new LiveLookupClient({
      fetch: (input) => (seen.push(input), json({})),
      rdapBaseUrls: { example: 'https://rdap.example' },
    });
    await client.rdap('acme.example');
    expect(seen).toEqual(['https://rdap.example/domain/acme.example']);
  });

  it('is unavailable on a server error', async () => {
    expect(await clientServing({}, 503).rdap('acme.example')).toEqual({
      status: 'unavailable',
      domain: 'acme.example',
      nameservers: [],
    });
  });

  it('is unavailable on a network error', async () => {
    const client = new LiveLookupClient({ fetch: () => Promise.reject(new TypeError('CORS')) });
    expect(await client.rdap('acme.example')).toMatchObject({ status: 'unavailable' });
  });
});

describe('certs timeout', () => {
  it('gives up on a slow crt.sh after the configured timeout', async () => {
    const hang: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const client = new LiveLookupClient({ fetch: hang, certsTimeoutMs: 20 });
    expect(await client.certs('tudelft.nl')).toEqual({
      status: 'unavailable',
      domain: 'tudelft.nl',
      certs: [],
    });
  });
});

describe('request timeout and overall deadline (API)', () => {
  const hang: FetchLike = () => new Promise(() => {});

  it('fails a slow DoH or RDAP request after requestTimeoutMs, trying the next resolver', async () => {
    const fetch: FetchLike = (input, init) =>
      /cloudflare-dns/.test(input) ? hang(input, init) : tudelft(input, init);
    const client = new LiveLookupClient({ fetch, requestTimeoutMs: 20 });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
    expect(await client.rdap('tudelft.nl')).toMatchObject({ status: 'unavailable' });
  });

  it('fails every lookup once the client signal aborts, even a fetch that ignores it', async () => {
    const deadline = new AbortController();
    const client = new LiveLookupClient({ fetch: hang, signal: deadline.signal });
    const pending = Promise.all([
      client.dns('tudelft.nl', 'A'),
      client.rdap('tudelft.nl'),
      client.certs('tudelft.nl'),
    ]);
    deadline.abort();
    const [dns, rdap, certs] = await pending;
    expect([dns.status, rdap.status, certs.status]).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    // Lookups started after the deadline fail at once.
    expect((await client.asn('130.161.128.82')).status).toBe('unavailable');
  });
});

describe('request hygiene (CORS-simple requests)', () => {
  it('sends no credentials and no headers other than accept', async () => {
    const inits: (RequestInit | undefined)[] = [];
    const spy: FetchLike = (input, init) => (inits.push(init), tudelft(input, init));
    const client = new LiveLookupClient({
      fetch: spy,
      rdapBaseUrls: { nl: 'https://rdap.sidn.nl/' },
    });

    await client.dns('tudelft.nl', 'A');
    await client.rdap('tudelft.nl');
    await client.asn('130.161.128.82');
    await client.certs('tudelft.nl');

    expect(inits).toHaveLength(4);
    for (const init of inits) {
      expect(init?.credentials).toBe('omit');
      const names = [...new Headers(init?.headers).keys()];
      expect(names.every((n) => n === 'accept')).toBe(true);
      expect(init?.redirect).toBe('manual');
    }
  });
});

const DOH_OK = { Status: 0, Answer: [{ type: 1, data: '130.161.128.82' }] };
const RDAP_OK = { nameservers: [{ ldhName: 'ns1.example' }] };

/** A body of `bytes` bytes that is valid JSON (a padded string), streamed in 16 KB chunks. */
function streamedJson(bytes: number, status = 200): Response {
  const chunk = 16 * 1024;
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const n = Math.min(chunk, bytes - sent);
      const part = new Uint8Array(n).fill(0x20); // spaces
      if (sent === 0) part[0] = 0x22; // opening quote
      if (sent + n === bytes) part[n - 1] = 0x22; // closing quote
      sent += n;
      controller.enqueue(part);
    },
  });
  return new Response(stream, { status });
}

/** A Response-like object without a stream, as some fetch implementations return. */
function bodiless(text: string | ArrayBuffer): Response {
  const buffer = typeof text === 'string' ? new TextEncoder().encode(text).buffer : text;
  return {
    ok: true,
    status: 200,
    type: 'basic',
    url: '',
    headers: new Headers(),
    body: null,
    arrayBuffer: async () => buffer,
  } as unknown as Response;
}

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

/** Pretends to be a browser: `redirect: 'manual'` yields an opaque redirect. */
function opaqueRedirect(): Response {
  const res = new Response(null, { status: 200 });
  Object.defineProperty(res, 'type', { value: 'opaqueredirect' });
  Object.defineProperty(res, 'status', { value: 0 });
  return res;
}

describe('response size caps', () => {
  it('serves a DoH answer under the cap', async () => {
    const client = new LiveLookupClient({ fetch: () => json(DOH_OK) });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({ status: 'ok' });
  });

  it('makes DNS unavailable when both resolvers send an oversized body (streamed)', async () => {
    const client = new LiveLookupClient({
      fetch: () => Promise.resolve(streamedJson(MAX_BODY_BYTES.doh + 1)),
    });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({ status: 'unavailable' });
  });

  it('falls back to the next resolver when one sends an oversized body', async () => {
    const fetch: FetchLike = (input) =>
      /cloudflare-dns/.test(input)
        ? Promise.resolve(streamedJson(MAX_BODY_BYTES.doh * 4))
        : json(DOH_OK);
    const client = new LiveLookupClient({ fetch });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({
      status: 'ok',
      records: ['130.161.128.82'],
    });
  });

  it('stops reading the stream once the cap is passed', async () => {
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(16 * 1024));
      },
    });
    const client = new LiveLookupClient({
      fetch: () => Promise.resolve(new Response(endless)),
      rdapBaseUrls: { example: 'https://rdap.example/' },
    });
    expect(await client.rdap('acme.example')).toMatchObject({ status: 'unavailable' });
    expect(pulls).toBeLessThan(MAX_BODY_BYTES.rdap / (16 * 1024) + 4);
  });

  it('rejects up front on an oversized Content-Length', async () => {
    const client = new LiveLookupClient({
      fetch: () =>
        Promise.resolve(
          new Response('{}', { headers: { 'content-length': String(MAX_BODY_BYTES.rdap + 1) } }),
        ),
      rdapBaseUrls: { example: 'https://rdap.example/' },
    });
    expect(await client.rdap('acme.example')).toMatchObject({ status: 'unavailable' });
  });

  it('caps RDAP at 512 KB and crt.sh at 5 MB', async () => {
    const serving = (bytes: number) =>
      new LiveLookupClient({
        fetch: () => Promise.resolve(streamedJson(bytes)),
        rdapBaseUrls: { example: 'https://rdap.example/' },
      });
    expect((await serving(MAX_BODY_BYTES.rdap + 1).rdap('acme.example')).status).toBe(
      'unavailable',
    );
    expect((await serving(MAX_BODY_BYTES.certs + 1).certs('acme.example')).status).toBe(
      'unavailable',
    );
    // Just under each cap the body is read; a JSON string is simply not an RDAP/crt.sh shape.
    expect((await serving(MAX_BODY_BYTES.rdap).rdap('acme.example')).status).toBe('unavailable');
    const certs = new LiveLookupClient({
      fetch: () => Promise.resolve(new Response(`[${' '.repeat(MAX_BODY_BYTES.certs - 2)}]`)),
    });
    expect(await certs.certs('acme.example')).toEqual({
      status: 'ok',
      domain: 'acme.example',
      certs: [],
    });
  });

  it('reads a body without a stream, and caps it too', async () => {
    const small = new LiveLookupClient({
      fetch: () => Promise.resolve(bodiless(JSON.stringify(RDAP_OK))),
      rdapBaseUrls: { example: 'https://rdap.example/' },
    });
    expect(await small.rdap('acme.example')).toMatchObject({
      status: 'ok',
      nameservers: ['ns1.example'],
    });
    const big = new LiveLookupClient({
      fetch: () => Promise.resolve(bodiless(new ArrayBuffer(MAX_BODY_BYTES.rdap + 1))),
      rdapBaseUrls: { example: 'https://rdap.example/' },
    });
    expect(await big.rdap('acme.example')).toMatchObject({ status: 'unavailable' });
  });
});

describe('redirects', () => {
  const rdapVia = (fetch: FetchLike) => new LiveLookupClient({ fetch }).rdap('acme.example');

  it('follows rdap.org to an https registry server (absolute or relative Location)', async () => {
    const seen: string[] = [];
    const result = await rdapVia((input) => {
      seen.push(input);
      if (input.startsWith('https://rdap.org/'))
        return Promise.resolve(redirect('https://rdap.registry.example/domain/acme.example'));
      if (input === 'https://rdap.registry.example/domain/acme.example')
        return Promise.resolve(redirect('/v2/domain/acme.example', 301));
      return json(RDAP_OK);
    });
    expect(result).toMatchObject({ status: 'ok', nameservers: ['ns1.example'] });
    expect(seen).toEqual([
      'https://rdap.org/domain/acme.example',
      'https://rdap.registry.example/domain/acme.example',
      'https://rdap.registry.example/v2/domain/acme.example',
    ]);
  });

  it('refuses a redirect to http://127.0.0.1 without fetching it', async () => {
    const seen: string[] = [];
    const result = await rdapVia((input) => {
      seen.push(input);
      return input.startsWith('https:')
        ? Promise.resolve(redirect('http://127.0.0.1/domain/acme.example'))
        : json(RDAP_OK);
    });
    expect(result).toEqual({ status: 'unavailable', domain: 'acme.example', nameservers: [] });
    expect(seen).toEqual(['https://rdap.org/domain/acme.example']);
  });

  it('refuses non-http schemes too', async () => {
    const result = await rdapVia(() => Promise.resolve(redirect('file:///etc/passwd')));
    expect(result.status).toBe('unavailable');
  });

  it('gives up after two redirects', async () => {
    let n = 0;
    const result = await rdapVia(() =>
      Promise.resolve(redirect(`https://hop${++n}.example/domain/acme.example`)),
    );
    expect(result.status).toBe('unavailable');
    expect(n).toBe(3); // the original request plus two followed hops
  });

  it('makes DNS unavailable when a resolver redirects off https', async () => {
    const client = new LiveLookupClient({
      fetch: () => Promise.resolve(redirect('http://127.0.0.1/dns-query')),
    });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({ status: 'unavailable' });
  });

  describe('in a browser (opaque redirects)', () => {
    it('repeats the request with redirect: follow and uses the followed answer', async () => {
      const modes: RequestInit['redirect'][] = [];
      const result = await rdapVia((_input, init) => {
        modes.push(init?.redirect);
        if (init?.redirect === 'manual') return Promise.resolve(opaqueRedirect());
        const res = new Response(JSON.stringify(RDAP_OK));
        Object.defineProperty(res, 'url', { value: 'https://rdap.registry.example/domain/x' });
        return Promise.resolve(res);
      });
      expect(result).toMatchObject({ status: 'ok', nameservers: ['ns1.example'] });
      expect(modes).toEqual(['manual', 'follow']);
    });

    it('rejects a followed redirect that ended on a non-https URL', async () => {
      const result = await rdapVia((_input, init) => {
        if (init?.redirect === 'manual') return Promise.resolve(opaqueRedirect());
        const res = new Response(JSON.stringify(RDAP_OK));
        Object.defineProperty(res, 'url', { value: 'http://127.0.0.1/domain/acme.example' });
        return Promise.resolve(res);
      });
      expect(result.status).toBe('unavailable');
    });
  });
});

describe('DoH JSON validation', () => {
  it.each([
    ['not JSON', 'not json'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['a string Status', JSON.stringify({ Status: '0' })],
    ['a non-integer Status', JSON.stringify({ Status: 0.5 })],
    ['Answer not an array', JSON.stringify({ Status: 0, Answer: { type: 1, data: 'x' } })],
    ['an Answer without data', JSON.stringify({ Status: 0, Answer: [{ type: 1 }] })],
    ['a numeric data', JSON.stringify({ Status: 0, Answer: [{ type: 1, data: 42 }] })],
    ['a null Answer entry', JSON.stringify({ Status: 0, Answer: [null] })],
  ])('makes DNS unavailable on %s (never throws)', async (_name, body) => {
    const client = new LiveLookupClient({ fetch: () => Promise.resolve(new Response(body)) });
    expect(await client.dns('tudelft.nl', 'A')).toEqual({
      status: 'unavailable',
      name: 'tudelft.nl',
      type: 'A',
      records: [],
    });
    expect((await client.asn('130.161.128.82')).status).toBe('unavailable');
  });

  it('falls back to the next resolver on a malformed answer', async () => {
    const fetch: FetchLike = (input) =>
      /cloudflare-dns/.test(input) ? json({ Status: 0, Answer: 'oops' }) : json(DOH_OK);
    const client = new LiveLookupClient({ fetch });
    expect(await client.dns('tudelft.nl', 'A')).toMatchObject({ status: 'ok' });
  });

  it('accepts a NOERROR answer without an Answer section (NODATA)', async () => {
    const client = new LiveLookupClient({ fetch: () => json({ Status: 0 }) });
    expect(await client.dns('tudelft.nl', 'MX')).toMatchObject({ status: 'ok', records: [] });
  });

  it('makes RDAP and crt.sh unavailable on a wrong JSON shape', async () => {
    const client = new LiveLookupClient({ fetch: () => json([1, 2]) });
    expect((await client.rdap('acme.example')).status).toBe('unavailable');
    const certs = new LiveLookupClient({ fetch: () => json({ not: 'an array' }) });
    expect((await certs.certs('acme.example')).status).toBe('unavailable');
  });
});
