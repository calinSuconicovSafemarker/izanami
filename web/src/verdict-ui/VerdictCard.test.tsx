import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PENDING } from '../rules';
import { caseFacts, cases } from '../rules/fixtures/cases';
import { officialFacts, variantFacts } from '../rules/test-facts';
import { OfficialVerdictCard, VerdictCard } from './VerdictCard';

const card = () => screen.getByRole('region', { name: /verdict/i });
const announcement = () => within(card()).getByRole('status');

describe('VerdictCard', () => {
  it.each(cases.cases)('$name ($variant) shows $expected', (c) => {
    render(<VerdictCard facts={caseFacts(c)} done />);
    expect(announcement()).toHaveTextContent(`Verdict: ${c.expected}`);
  });
});

const byName = (name: string) => cases.cases.find((c) => c.name.startsWith(name))!;
const DEFENSIVE = 'defensive registration sharing nameservers and hosting';
const group = (name: RegExp) => within(card()).getByRole('list', { name });

describe('VerdictCard while lookups are in flight', () => {
  it('lists rules awaiting slow sources as still checking, and announces no verdict yet', () => {
    const facts = caseFacts(byName(DEFENSIVE));
    facts.variantFacts = { ...facts.variantFacts, firstCertDate: PENDING, asns: PENDING };
    render(<VerdictCard facts={facts} done={false} />);
    const checking = group(/still checking/i);
    expect(checking).toBeVisible();
    expect(checking).toHaveTextContent('Fresh TLS certificate');
    expect(checking).toHaveTextContent('Same hosting network');
    expect(checking).toHaveTextContent('still checking…');
    expect(within(card()).queryByRole('list', { name: /couldn.t check/i })).toBeNull();
    expect(announcement()).toBeEmptyDOMElement();
  });
});

describe('VerdictCard header', () => {
  it('shows the total score and a one-sentence summary', () => {
    render(<VerdictCard facts={caseFacts(byName(DEFENSIVE))} done />);
    // +25 tld-swap +10 tranco +15 much-newer −40 NS −15 ASN (no-mx suppressed by shared NS)
    expect(card()).toHaveTextContent('Score −5');
    expect(within(card()).getByText(/legit signals outweigh/i)).toBeInTheDocument();
  });

  it('explains which sources failed when data is insufficient', () => {
    render(<VerdictCard facts={caseFacts(byName('all lookups unavailable'))} done />);
    const summary = within(card()).getByText(/couldn.t be checked/i);
    for (const source of ['DNS', 'RDAP', 'ASN', 'crt.sh']) {
      expect(summary).toHaveTextContent(source);
    }
  });
});

describe('VerdictCard rule groups', () => {
  it('splits fired rules into risk and legit signals, each with weight and explanation', () => {
    render(<VerdictCard facts={caseFacts(byName(DEFENSIVE))} done />);
    const legit = group(/legit signals fired/i);
    expect(legit).toHaveTextContent('−40');
    expect(legit).toHaveTextContent('tudelft.com shares nameservers with tudelft.nl');
    const risk = group(/risk signals fired/i);
    expect(risk).toHaveTextContent('+10');
    expect(risk).toHaveTextContent('not in the Tranco top 100k');
    expect(risk).not.toHaveTextContent('nameservers');
  });

  it("always shows rules that couldn't be checked, and collapses rules that didn't fire", () => {
    render(<VerdictCard facts={caseFacts(byName('all lookups unavailable'))} done />);
    const unknown = group(/couldn.t check/i);
    expect(unknown).toBeVisible();
    expect(unknown).toHaveTextContent('Certificate Transparency history (crt.sh) unavailable.');
    const notFired = group(/not fired/i);
    expect(notFired).not.toBeVisible();
    expect(notFired).toHaveTextContent(
      "tudelft.online is not one of Delft University of Technology's known official domains.",
    );
  });

  it('lists a rule that does not apply (unrelated domain) as n/a among the not-fired rules', () => {
    render(
      <VerdictCard facts={{ variantFacts: variantFacts(), officialFacts: officialFacts() }} done />,
    );
    const notFired = group(/not fired/i);
    expect(notFired).toHaveTextContent('n/a');
    expect(notFired).toHaveTextContent('example-unrelated.nl is not a lookalike');
  });
});

describe('VerdictCard "Why" list', () => {
  const why = () => within(card()).getByRole('list', { name: /^why/i });

  it('lists the top reasons, with their weights, directly under the verdict', () => {
    render(<VerdictCard facts={caseFacts(byName('fresh combo-squat'))} done />);
    const items = within(why()).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      '+40 Registered 12 days ago',
      '+25 Contains "tudelft"',
      '+20 First TLS certificate issued 11 days ago',
      '+15 Set up to send mail (MX mx1.privateemail.com)',
    ]);
  });

  it('is read after the verdict label and before the full rule list', () => {
    render(<VerdictCard facts={caseFacts(byName(DEFENSIVE))} done />);
    const label = within(card()).getByText('Likely legit');
    const after = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(label, why())).toBe(true);
    expect(after(why(), group(/risk signals fired/i))).toBe(true);
    expect(why()).toHaveTextContent("Shares Delft University of Technology's nameservers");
  });

  it("names what couldn't be checked when data is insufficient", () => {
    render(<VerdictCard facts={caseFacts(byName('all lookups unavailable'))} done />);
    expect(why()).toHaveTextContent('Registration date unavailable');
    expect(why()).toHaveTextContent('Certificate history (crt.sh) unavailable');
  });

  it('is announced to screen readers right after the verdict', () => {
    render(<VerdictCard facts={caseFacts(byName('parked typo-squat'))} done />);
    expect(announcement()).toHaveTextContent(
      'Verdict: Likely fraud. Why: 1 letter away from "tudelft"; Registered 32 years after tudelft.nl;',
    );
  });

  it('is absent for an official domain and while still checking', () => {
    const { unmount } = render(<VerdictCard facts={caseFacts(byName('official domain'))} done />);
    expect(within(card()).queryByRole('list', { name: /^why/i })).toBeNull();
    unmount();
    render(<OfficialVerdictCard domain="tudelft.nl" orgName="TU Delft" />);
    expect(within(card()).queryByRole('list', { name: /^why/i })).toBeNull();
  });
});
