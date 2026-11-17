import { describe, expect, it } from 'vitest';
import { diffOrgs, renderDiff } from './diff';
import type { Org } from './select';

function org(id: string, name: string, domains: string[], confirmedAt = '2026-11-17'): Org {
  return {
    slug: name.toLowerCase(),
    name,
    wikidataId: id,
    country: null,
    primaryDomain: domains[0] ?? '',
    officialDomains: domains,
    wikidataDomain: domains[0] ?? null,
    trancoRank: 1,
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
});
