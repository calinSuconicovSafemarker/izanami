import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toUnicode } from 'punycode/';
import { parseVariant, similarity } from '../domain';
import { known, PENDING, UNKNOWN, type Facts, type VariantFacts } from '../rules';
import { officialFacts, variantFacts } from '../rules/test-facts';
import { DomainAnalysisPanel } from './DomainAnalysisPanel';

/** Facts for `input` against TU Delft, with the real similarity of the variant. */
function factsFor(input: string, overrides: Partial<VariantFacts> = {}): Facts {
  const v = parseVariant(input);
  return {
    variantFacts: variantFacts({
      domain: v.registrableDomain,
      unicode: toUnicode(v.registrableDomain),
      tld: v.tld,
      similarity: similarity(v, 'tudelft', ['tudelft.nl']),
      ...overrides,
    }),
    officialFacts: officialFacts(),
  };
}

const panel = () => screen.getByRole('region', { name: /domain analysis/i });
/** The value cell for a row label (`<dt>` → following `<dd>`). */
const row = (label: RegExp) => {
  const term = within(panel()).getByText(label, { selector: 'dt' });
  return term.nextElementSibling as HTMLElement;
};

describe('DomainAnalysisPanel technique', () => {
  it.each([
    ['tudelft.md', 'TLD swap', /different extension/i],
    ['tuddelft.nl', 'Typo-squat', /mistyp/i],
    ['tudеlft.nl', 'Homoglyph', /look-alike characters/i],
    ['tudelft-login.com', 'Combo-squat', /extra word/i],
    ['tudelft.nl.evil.com', 'Subdomain trick', /subdomain/i],
    ['example.org', 'Unrelated', /no typosquatting technique/i],
  ])('%s is labelled %s with how the attack works', (input, label, description) => {
    render(<DomainAnalysisPanel facts={factsFor(input)} />);
    expect(row(/technique/i)).toHaveTextContent(label);
    expect(row(/technique/i)).toHaveTextContent(description);
  });
});

describe('DomainAnalysisPanel similarity and forms', () => {
  it('shows edit distance and similarity % to the brand label', () => {
    render(<DomainAnalysisPanel facts={factsFor('tuddelft.nl')} />);
    expect(row(/similarity/i)).toHaveTextContent('Edit distance 1');
    expect(row(/similarity/i)).toHaveTextContent('88% similar to tudelft');
  });

  it('highlights the swapped character of a homoglyph', () => {
    render(<DomainAnalysisPanel facts={factsFor('tudеlft.nl')} />);
    const swapped = within(row(/similarity/i)).getByText('е', { selector: 'mark' });
    expect(swapped).toBeInTheDocument();
    expect(row(/similarity/i)).toHaveTextContent('е (U+0435) looks like e');
  });

  it('does not highlight anything for a non-homoglyph', () => {
    render(<DomainAnalysisPanel facts={factsFor('tuddelft.nl')} />);
    expect(panel().querySelector('mark')).toBeNull();
  });

  it('shows the Unicode and punycode forms', () => {
    render(<DomainAnalysisPanel facts={factsFor('tudеlft.nl')} />);
    expect(row(/unicode/i)).toHaveTextContent('tudеlft.nl');
    expect(row(/punycode/i)).toHaveTextContent('xn--tudlft-5of.nl');
  });
});

describe('DomainAnalysisPanel registration', () => {
  it('shows registration date with age, registrar, nameservers and the official date', () => {
    render(
      <DomainAnalysisPanel
        facts={factsFor('tudelft.com', { registrationDate: known('2001-07-01T00:00:00Z') })}
      />,
    );
    expect(row(/^registered$/i)).toHaveTextContent('2001-07-01 · 25 years');
    expect(row(/registrar/i)).toHaveTextContent('Hosting Provider B.V.');
    expect(row(/nameservers/i)).toHaveTextContent('ns1.hostingprovider.nl');
    expect(row(/official registered/i)).toHaveTextContent('tudelft.nl: 1987-03-17 · 39 years');
  });

  it('says "not published by registry" when RDAP has no registration data', () => {
    render(
      <DomainAnalysisPanel
        facts={factsFor('tudelft.com', { registrationDate: UNKNOWN, registrar: UNKNOWN })}
      />,
    );
    expect(row(/^registered$/i)).toHaveTextContent('not published by registry');
    expect(row(/registrar/i)).toHaveTextContent('not published by registry');
  });

  it('says "checking…" while registration data is pending', () => {
    render(<DomainAnalysisPanel facts={factsFor('tudelft.com', { registrationDate: PENDING })} />);
    expect(row(/^registered$/i)).toHaveTextContent('checking…');
  });

  it('says "not registered" for a variant nobody registered', () => {
    render(
      <DomainAnalysisPanel
        facts={factsFor('tudelft-xq7z.nl', {
          existence: known('not-registered'),
          registrationDate: UNKNOWN,
          registrar: UNKNOWN,
        })}
      />,
    );
    expect(row(/^registered$/i)).toHaveTextContent('not registered');
  });
});

describe('DomainAnalysisPanel hosting', () => {
  it('lists IPs and ASN', () => {
    render(<DomainAnalysisPanel facts={factsFor('tudelft.com')} />);
    expect(row(/hosting/i)).toHaveTextContent('192.0.2.10');
    expect(row(/hosting/i)).toHaveTextContent('AS20857');
    expect(row(/hosting/i)).not.toHaveTextContent(/shared/i);
  });

  it('flags hosting shared with the official domain', () => {
    render(
      <DomainAnalysisPanel
        facts={factsFor('tudelft.com', {
          addresses: known(['130.161.128.82']),
          asns: known([1128]),
        })}
      />,
    );
    expect(row(/hosting/i)).toHaveTextContent('shared with tudelft.nl');
  });
});
