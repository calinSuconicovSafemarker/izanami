import type { Org } from '../orgs';

/** Bumped on any breaking change to an export document's shape. */
export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportOrg {
  slug: string;
  name: string;
  primaryDomain: string;
  officialDomains: string[];
}

export const exportOrg = (org: Org): ExportOrg => ({
  slug: org.slug,
  name: org.name,
  primaryDomain: org.primaryDomain,
  officialDomains: [...org.officialDomains],
});
