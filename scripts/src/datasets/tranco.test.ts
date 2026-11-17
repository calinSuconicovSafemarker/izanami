import { describe, expect, it } from 'vitest';
import { trancoTopDomains } from './tranco';
import { zipOf } from './zip-fixture';

describe('trancoTopDomains', () => {
  it('returns the first N domains of the zipped rank,domain CSV in rank order', () => {
    const zip = zipOf('top-1m.csv', '1,google.com\r\n2,Microsoft.com\r\n3,facebook.com\r\n');
    expect(trancoTopDomains(zip, 2)).toEqual(['google.com', 'microsoft.com']);
    expect(trancoTopDomains(zip, 10)).toEqual(['google.com', 'microsoft.com', 'facebook.com']);
  });
});
