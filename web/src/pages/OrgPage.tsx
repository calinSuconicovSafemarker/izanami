import { useParams } from 'react-router-dom';
import { LookupTerminalSlot } from '../components/LookupTerminalSlot';
import { OfficialDomainCard } from '../components/OfficialDomainCard';
import { getOrg } from '../orgs';
import { LookalikeScan } from '../scan';
import { NotFoundPage } from './NotFoundPage';

export function OrgPage() {
  const { slug = '' } = useParams();
  const org = getOrg(slug);
  if (!org) return <NotFoundPage />;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight break-words text-zinc-100 sm:text-3xl">
        {org.name}
      </h1>
      <p className="-mt-4 text-sm text-zinc-400">
        Heuristic, not a guarantee. Passive public lookups only.
      </p>
      <OfficialDomainCard org={org} />
      <LookupTerminalSlot org={org} />
      <LookalikeScan org={org} />
    </main>
  );
}
