import type { PermutationTechnique } from './permutations';
import type { LookalikeKind } from './similarity';

/** Any technique id: a looked-up variant's kind or a scan candidate's permutation. */
export type TechniqueId = LookalikeKind | PermutationTechnique;

export interface TechniqueInfo {
  /** Short human label (`TLD swap`). */
  label: string;
  /** How the attack works, in one sentence. */
  description: string;
}

/**
 * The one technique vocabulary (S4), shared by the domain analysis panel, the lookalike scan
 * table and the export.
 */
export const TECHNIQUES: Record<TechniqueId, TechniqueInfo> = {
  official: {
    label: 'Official',
    description: "One of the organisation's known official domains.",
  },
  'tld-swap': {
    label: 'TLD swap',
    description:
      "The same name under a different extension, betting you won't notice how the address ends.",
  },
  typo: {
    label: 'Typo-squat',
    description:
      'One or two characters added, dropped, swapped or replaced to catch people who mistype the address.',
  },
  omission: {
    label: 'Omission',
    description: 'One letter dropped from the name, as when typing fast.',
  },
  repetition: {
    label: 'Repetition',
    description: 'One letter doubled, as when a key is pressed twice.',
  },
  transposition: {
    label: 'Transposition',
    description: 'Two neighbouring letters swapped.',
  },
  replacement: {
    label: 'Replacement',
    description: 'One letter replaced by a neighbouring key on the keyboard.',
  },
  hyphenation: {
    label: 'Hyphenation',
    description: 'A hyphen inserted into the name.',
  },
  homoglyph: {
    label: 'Homoglyph',
    description:
      'Letters replaced by look-alike characters, often from another alphabet, so the name reads the same.',
  },
  combo: {
    label: 'Combo-squat',
    description:
      'The brand name plus an extra word (login, secure, support…) to pass as an official service.',
  },
  'subdomain-trick': {
    label: 'Subdomain trick',
    description:
      "The brand sits in a subdomain of someone else's domain; the real owner is the part at the end.",
  },
  unrelated: {
    label: 'Unrelated',
    description: 'Does not closely resemble the brand: no typosquatting technique detected.',
  },
};

export const techniqueLabel = (id: TechniqueId) => TECHNIQUES[id].label;
