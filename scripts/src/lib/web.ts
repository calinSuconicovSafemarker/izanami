// The only module in scripts/ that imports from the web workspace: the runtime data formats the
// generator must produce (schema types and encoders). Everything else in scripts/ is standalone.
export { decodeDomainSet, encodeDomainSet } from '../../../web/src/lib/domain-set';
export type {
  Org,
  Popularity,
  PopularityBucket,
  PopularitySource,
  RelatedDomain,
  RelatedSource,
} from '../../../web/src/orgs/org';
