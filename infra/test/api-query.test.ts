import { describe, expect, it } from 'vitest';
import { API_QUERY_FUNCTION_CODE } from '../lib/api-query';

type Qs = Record<string, { value: string; multiValue?: { value: string }[] }>;
const handler = new Function(`${API_QUERY_FUNCTION_CODE}; return handler;`)() as (event: {
  request: { querystring: Qs };
}) => { querystring: Qs };

const run = (querystring: Qs) => handler({ request: { querystring } }).querystring;

describe('API cache-key function', () => {
  it.each([
    ['GOOGLE.com', 'google.com'],
    ['google.com.', 'google.com'],
    ['%20google.com', 'google.com'],
    ['google.com%2E%2E', 'google.com'],
    ['Login.Gooogle.COM', 'login.gooogle.com'],
  ])('normalises domain=%s to %s', (raw, expected) => {
    expect(run({ org: { value: 'Google' }, domain: { value: raw } })).toEqual({
      org: { value: 'google' },
      domain: { value: expected },
    });
  });

  it('drops query strings other than org and domain', () => {
    expect(run({ domain: { value: 'a.com' }, x: { value: '1' }, cb: { value: '2' } })).toEqual({
      domain: { value: 'a.com' },
    });
  });

  it('leaves repeated parameters alone so the API can reject them', () => {
    const domain = { value: 'a.com', multiValue: [{ value: 'a.com' }, { value: 'b.com' }] };
    expect(run({ domain })).toEqual({ domain });
  });

  it('leaves undecodable values alone and re-encodes unicode', () => {
    expect(run({ domain: { value: '%E0%A4%A' } })).toEqual({ domain: { value: '%E0%A4%A' } });
    expect(run({ domain: { value: 'B%C3%BCcher.DE' } })).toEqual({
      domain: { value: 'b%C3%BCcher.de' },
    });
  });

  it('stays well under the CloudFront Functions size limit', () => {
    expect(Buffer.byteLength(API_QUERY_FUNCTION_CODE)).toBeLessThan(10 * 1024);
  });
});
