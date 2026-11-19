import { describe, expect, it } from 'vitest';
import { FixtureLookupClient } from '../../web/src/lookup/fixture-client';
import { createHandler, handler, LIVE_DEPS } from './handler';

const event = (method: string, rawPath: string, rawQueryString = '') => ({
  rawPath,
  rawQueryString,
  requestContext: { http: { method } },
});

describe('Lambda function URL handler', () => {
  it('maps a function URL event to the API and back', async () => {
    const h = createHandler({ createClient: () => new FixtureLookupClient() });
    const res = await h(event('GET', '/api/check', 'org=google&domain=c.gle'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(JSON.parse(res.body)).toMatchObject({ verdict: { label: 'Official' } });
  });

  it('is exported as `handler` with the live dependencies (no network for a 405)', async () => {
    const res = await handler(event('POST', '/api/check'));
    expect(res.statusCode).toBe(405);
  });

  it('keeps the whole live budget under 12 s, inside the 15 s Lambda timeout', () => {
    expect(LIVE_DEPS.lookupBudgetMs).toBeLessThan(LIVE_DEPS.hardTimeoutMs!);
    expect(LIVE_DEPS.hardTimeoutMs).toBeLessThan(12_000);
  });
});
