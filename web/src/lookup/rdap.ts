/** The subset of an RFC 9083 domain object we read. */
export interface RdapDomain {
  events?: { eventAction?: string; eventDate?: string }[];
  entities?: RdapEntity[];
  nameservers?: { ldhName?: string }[];
  /** RFC 9537 redaction markers. */
  redacted?: { name?: { description?: string; type?: string } }[];
}

interface RdapEntity {
  roles?: string[];
  /** jCard: ['vcard', [[name, params, type, value], ...]] */
  vcardArray?: [string, [string, unknown, string, unknown][]];
  entities?: RdapEntity[];
}

export interface ParsedRdapDomain {
  registrationDate?: string;
  registrar?: string;
  registrant?: string;
  nameservers: string[];
}

/** Placeholder values registries put in place of personal data. */
const REDACTED_TEXT =
  /redacted|privacy|private|withheld|not disclosed|data protected|gdpr|statutory masking/i;

export function parseRdapDomain(body: RdapDomain): ParsedRdapDomain {
  const registrationDate = body.events?.find((e) => e.eventAction === 'registration')?.eventDate;
  const registrar = vcardText(findEntity(body.entities, 'registrar'), 'fn');
  const registrant = unredactedRegistrant(body);
  const nameservers = (body.nameservers ?? [])
    .map((n) => n.ldhName?.toLowerCase().replace(/\.$/, ''))
    .filter((n): n is string => !!n);
  return {
    ...(registrationDate && { registrationDate }),
    ...(registrar && { registrar }),
    ...(registrant && { registrant }),
    nameservers,
  };
}

function unredactedRegistrant(body: RdapDomain): string | undefined {
  const entity = findEntity(body.entities, 'registrant');
  const markers = (body.redacted ?? []).map(
    (r) => `${r.name?.description ?? ''} ${r.name?.type ?? ''}`,
  );
  const isMarked = (field: RegExp) => markers.some((m) => field.test(m));
  const candidates: [string, RegExp][] = [
    ['fn', /registrant name/i],
    ['org', /registrant org/i],
  ];
  for (const [prop, marker] of candidates) {
    const value = vcardText(entity, prop);
    if (value && !REDACTED_TEXT.test(value) && !isMarked(marker)) return value;
  }
  return undefined;
}

function findEntity(entities: RdapEntity[] | undefined, role: string): RdapEntity | undefined {
  for (const e of entities ?? []) {
    if (e.roles?.includes(role)) return e;
    const nested = findEntity(e.entities, role);
    if (nested) return nested;
  }
  return undefined;
}

function vcardText(entity: RdapEntity | undefined, prop: string): string | undefined {
  const value = entity?.vcardArray?.[1]?.find((p) => p[0] === prop)?.[3];
  if (Array.isArray(value)) return value.filter(Boolean).join(' ').trim() || undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
