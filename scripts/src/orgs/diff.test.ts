import { describe, expect, it } from 'vitest';
import { diffOrgs, renderDiff } from './diff';
import { majesticOnly } from '../lib/popularity-fixture';
import type { Org } from './select';

function org(id: string, name: string, domains: string[], confirmedAt = '2026-11-17'): Org {
  return {
    slug: name.toLowerCase(),
    name,
    wikidataId: id,
    country: null,
    primaryDomain: domains[0] ?? '',
    officialDomains: domains,
    relatedDomains: [],
    brandTlds: [],
    wikidataDomain: domains[0] ?? null,
    popularity: majesticOnly(1),
    confirmedAt,
  };
}

describe('diffOrgs', () => {
  it('is empty when only the confirmation date changed', () => {
    const previous = [org('Q1', 'Acme', ['acme.com'], '2026-10-01')];
    const next = [org('Q1', 'Acme', ['acme.com'], '2026-11-17')];
    const diff = diffOrgs(previous, next);
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
    expect(renderDiff(diff)).toBe('# Data diff\n\nNo changes since the previous `orgs.json`.\n');
  });

  it('reports added and removed organisations and changed official domains', () => {
    const diff = diffOrgs(
      [org('Q1', 'Acme', ['acme.com']), org('Q2', 'Gone', ['gone.com'])],
      [
        { ...org('Q1', 'Acme', ['acme.co', 'acme.com']), primaryDomain: 'acme.com' },
        org('Q3', 'New', ['new.com']),
      ],
    );
    expect(renderDiff(diff)).toBe(
      [
        '# Data diff',
        '',
        'Review before committing (ADR-0002).',
        '',
        '## Added (1)',
        '',
        '- New (Q3): new.com',
        '',
        '## Removed (1)',
        '',
        '- Gone (Q2): gone.com',
        '',
        '## Changed official domains (1)',
        '',
        '- Acme (Q1): +acme.co',
        '',
      ].join('\n'),
    );
  });

  it('reports a primary-domain switch', () => {
    const before = org('Q1', 'Acme', ['acme.com', 'acme.org']);
    const after = { ...before, primaryDomain: 'acme.org' };
    expect(renderDiff(diffOrgs([before], [after]))).toContain(
      '- Acme (Q1): primary acme.com → acme.org',
    );
  });

  it('reports related-domain changes, including those of added organisations', () => {
    const before = org('Q1', 'Acme', ['acme.com']);
    before.relatedDomains = [
      { domain: 'old.com', source: 'curated' },
      { domain: 'kept.com', source: 'curated' },
    ];
    const after = {
      ...before,
      relatedDomains: [
        { domain: 'kept.com', source: 'curated' as const },
        { domain: 'acme-tube.com', source: 'wikidata-owned' as const, via: 'AcmeTube' },
      ],
    };
    const added = {
      ...org('Q3', 'New', ['new.com']),
      relatedDomains: [{ domain: 'new.net', source: 'published-list' as const, via: 'New list' }],
    };
    const text = renderDiff(diffOrgs([before], [after, added]));
    expect(text).toContain(
      [
        '## Changed related domains (2)',
        '',
        '- Acme (Q1): +acme-tube.com (wikidata-owned: AcmeTube), -old.com',
        '- New (Q3): +new.net (published-list: New list)',
      ].join('\n'),
    );
    expect(text).not.toContain('Changed official domains');
  });

  it('lists curated or published domains skipped because another org has them', () => {
    const text = renderDiff({
      ...diffOrgs([], []),
      skipped: [
        {
          orgId: 'Q1',
          domain: 'acme.com',
          source: 'curated',
          reason: 'official domain of Acme (Q1)',
        },
      ],
    });
    expect(text).toContain('## Skipped related domains (1)');
    expect(text).toContain('- Q1: acme.com (curated) — official domain of Acme (Q1)');
  });
});
