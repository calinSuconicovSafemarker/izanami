import { describe, expect, it } from 'vitest';
import { caseFacts, cases } from './fixtures/cases';
import { evaluate } from './evaluate';
import { known } from './types';
import { whyList } from './why';

const byName = (name: string) => cases.cases.find((c) => c.name.startsWith(name))!;

// Expected values worked out by hand from cases.json and the weights in SPEC/ADR-0003:
// the fired rules with non-zero weight, largest |weight| first (ties in display order), max 4.
const EXPECTED: Record<string, string[]> = {
  'official domain': [],
  'defensive registration sharing nameservers': [
    'same-nameservers', // −40
    'brand-lookalike', // +25 tld-swap
    'much-newer', // +15 (2001 vs 1987)
    'same-asn', // −15 (not-in-tranco +10 drops off)
  ],
  'defensive typo registration': [
    'same-nameservers', // −40
    'same-registrar', // −35 MarkMonitor
    'brand-lookalike', // +25 typo
    'same-asn', // −15
  ],
  'fresh combo-squat': ['young-domain', 'brand-lookalike', 'fresh-cert', 'mail-ready'],
  'parked typo-squat': ['brand-lookalike', 'much-newer', 'not-in-tranco', 'no-mx'],
  'homoglyph (Cyrillic e)': ['young-domain', 'brand-lookalike', 'not-in-tranco', 'no-mx'],
  'registered but not resolving': [
    'brand-lookalike',
    'registered-not-resolving',
    'much-newer',
    'not-in-tranco',
  ],
  'old student-team combo site': ['brand-lookalike', 'not-in-tranco'],
  // Insufficient data: what couldn't be checked, by |weight|.
  'all lookups unavailable': ['young-domain', 'same-nameservers', 'same-registrar', 'fresh-cert'],
};

describe('whyList', () => {
  it('has an expectation for every case', () => {
    for (const c of cases.cases) {
      expect(
        Object.keys(EXPECTED).some((k) => c.name.startsWith(k)),
        c.name,
      ).toBe(true);
    }
  });

  it.each(Object.entries(EXPECTED))('%s → %j', (name, ids) => {
    expect(whyList(caseFacts(byName(name))).map((w) => w.id)).toEqual(ids);
  });

  it('tags each reason as a risk or legit signal', () => {
    const why = whyList(caseFacts(byName('defensive registration sharing nameservers')));
    expect(why.map((w) => w.kind)).toEqual(['legit', 'risk', 'risk', 'legit']);
  });

  it('names what could not be checked when data is insufficient', () => {
    const why = whyList(caseFacts(byName('all lookups unavailable')));
    expect(why.every((w) => w.kind === 'unknown')).toBe(true);
    expect(why.map((w) => w.summary)).toEqual([
      'Registration date unavailable',
      "Nameservers couldn't be compared",
      "Registrar couldn't be compared",
      'Certificate history (crt.sh) unavailable',
    ]);
  });

  it('is empty for a domain that is not registered', () => {
    const facts = caseFacts(byName('registered but not resolving'));
    facts.variantFacts.existence = known('not-registered');
    expect(whyList(facts)).toEqual([]);
  });

  it('gives short phrases with concrete values', () => {
    const summaries = (name: string) => whyList(caseFacts(byName(name))).map((w) => w.summary);
    expect(summaries('fresh combo-squat')).toEqual([
      'Registered 12 days ago',
      'Contains "tudelft"',
      'First TLS certificate issued 11 days ago',
      'Set up to send mail (MX mx1.privateemail.com)',
    ]);
    expect(summaries('defensive typo registration')).toEqual([
      "Shares Google's nameservers (google.com)",
      "Uses Google's brand-protection registrar (MarkMonitor Inc.)",
      '1 letter away from "google"',
      "Hosted on Google's network (AS15169)",
    ]);
    expect(summaries('homoglyph (Cyrillic e)')[1]).toBe('Uses look-alike letters (Cyrillic е)');
  });
});

describe('RuleResult.summary', () => {
  it('is a short phrase for every rule outcome in every case', () => {
    for (const c of cases.cases) {
      for (const r of evaluate(caseFacts(c))) {
        expect(r.summary.length, `${c.name} / ${r.id}`).toBeGreaterThan(3);
        expect(r.summary.length, `${c.name} / ${r.id}: ${r.summary}`).toBeLessThanOrEqual(80);
        expect(r.summary).not.toMatch(/\.$/);
      }
    }
  });
});
