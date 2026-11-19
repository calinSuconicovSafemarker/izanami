export { InvalidVariantError, parseVariant, type ParsedVariant } from './parse';
export {
  DEFAULT_PERMUTATION_LIMIT,
  generatePermutations,
  type Candidate,
  type PermutationInput,
  type PermutationTechnique,
} from './permutations';
export { normaliseTld } from './tld-name';
export { techniqueLabel, TECHNIQUES, type TechniqueId, type TechniqueInfo } from './techniques';
export { editDistance, similarity, type LookalikeKind, type Similarity } from './similarity';
