import { has } from './popularity';

describe('Popular top-100k set', () => {
  it('contains popular registrable domains', () => {
    expect(has('google.com')).toBe(true);
    expect(has('tudelft.nl')).toBe(true);
  });

  it('does not contain made-up domains', () => {
    expect(has('tudelft-nonexistent-zzzq.com')).toBe(false);
  });
});
