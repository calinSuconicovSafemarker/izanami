import { FIXTURES, FIXTURE_RDAP_BASE_URLS, fixtureFetch } from './fixture-client';
import { LiveLookupClient } from './live-client';
import { withSessionCache } from './session-cache';
import type { FetchLike } from './types';

function countingClient(inner: FetchLike) {
  const requests: string[] = [];
  const fetch: FetchLike = (input, init) => (requests.push(input), inner(input, init));
  const client = withSessionCache(
    new LiveLookupClient({ fetch, rdapBaseUrls: FIXTURE_RDAP_BASE_URLS }),
  );
  return { client, requests };
}

describe('withSessionCache', () => {
  it('fetches the same fact only once per session, including concurrent calls', async () => {
    const { client, requests } = countingClient(fixtureFetch([FIXTURES['tudelft.nl']!]));

    const [a, b] = await Promise.all([client.rdap('tudelft.nl'), client.rdap('tudelft.nl')]);
    await client.rdap('tudelft.nl');

    expect(a).toEqual(b);
    expect(a.registered).toBe(true);
    expect(requests).toEqual(['https://rdap.sidn.nl/domain/tudelft.nl']);
  });

  it('keys DNS lookups by name and type', async () => {
    const { client, requests } = countingClient(fixtureFetch([FIXTURES['tudelft.nl']!]));

    await client.dns('tudelft.nl', 'A');
    await client.dns('tudelft.nl', 'NS');
    await client.dns('tudelft.nl', 'A');

    expect(requests).toHaveLength(2);
  });

  it('does not cache unavailable results, so a later call can retry', async () => {
    let up = false;
    const flaky: FetchLike = (input, init) =>
      up ? fixtureFetch([FIXTURES['tudelft.nl']!])(input, init) : Promise.reject(new TypeError());
    const { client } = countingClient(flaky);

    expect((await client.certs('tudelft.nl')).status).toBe('unavailable');
    up = true;
    expect((await client.certs('tudelft.nl')).status).toBe('ok');
  });
});
