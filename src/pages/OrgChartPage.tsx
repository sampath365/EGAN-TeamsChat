import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, ChevronDown, ChevronRight, Network, Search, Users, UserRound, Layers, ListTree, Mail,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { Hierarchy, OrgNode, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, Badge, EmptyState, Spinner, Tabs } from '@/components/ui';
import { PersonCard } from '@/components/PersonCard';

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'neutral' | 'amber'> = {
  owner: 'amber', admin: 'violet', member: 'brand', guest: 'neutral', bot: 'neutral',
};

export function OrgChartPage() {
  const { team, online, toast } = useApp();
  const [data, setData] = useState<Hierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tree' | 'departments'>('tree');
  const [query, setQuery] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!team) return;
    setLoading(true);
    api.hierarchy(team.id)
      .then(setData)
      .catch((e) => toast({ title: 'Could not load the org chart', body: e.message, tone: 'error' }))
      .finally(() => setLoading(false));
  }, [team?.id, toast]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return null;
    const ids = new Set<string>();
    const walk = (node: OrgNode) => {
      if (
        node.user.name.toLowerCase().includes(q)
        || (node.user.position || '').toLowerCase().includes(q)
        || (node.user.department || '').toLowerCase().includes(q)
        || (node.user.employeeId || '').toLowerCase().includes(q)
      ) ids.add(node.user.id);
      node.children.forEach(walk);
    };
    data.roots.forEach(walk);
    return ids;
  }, [query, data]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-[20px] font-black">
              <Network size={19} className="text-brand-600 dark:text-brand-300" />
              Company hierarchy
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {data ? `${data.total} people · ${data.departments.length} departments` : 'Who reports to whom, and where everyone sits.'}
            </p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input h-9 w-48 pl-8 text-[12.5px] sm:w-60"
              placeholder="Search name, role, dept…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { key: 'tree', label: 'Reporting tree', icon: <ListTree size={13} /> },
              { key: 'departments', label: 'By department', icon: <Layers size={13} />, badge: data?.departments.length },
            ]}
          />
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
        ) : !data || data.total === 0 ? (
          <EmptyState icon={<Users size={20} />} title="No one to chart yet" body="Invite people to the team and their reporting lines appear here." />
        ) : view === 'tree' ? (
          <div className="space-y-1.5">
            {data.roots.map((root) => (
              <TreeNode
                key={root.user.id}
                node={root}
                depth={0}
                online={online}
                matches={matches}
                query={query}
                onOpen={setProfileId}
                defaultOpen
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {data.departments.map((dept) => (
              <section key={dept.name} className="card p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-bold">
                    <Building2 size={14} className="text-brand-600 dark:text-brand-300" />
                    {dept.name}
                  </h2>
                  <Badge tone="neutral">{dept.people.length}</Badge>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {dept.people.map(({ user, role }) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setProfileId(user.id)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border p-2 text-left transition hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-500/10 bordered',
                        matches?.has(user.id) && 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/15',
                      )}
                    >
                      <Avatar name={user.name} color={user.avatarColor} url={user.avatarUrl} size={32} online={online.has(user.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-bold">{user.name}</span>
                        <span className="block truncate text-[10.5px] text-muted">{user.position || '—'}</span>
                      </span>
                      <Badge tone={ROLE_TONE[role] || 'neutral'}>{role}</Badge>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <PersonCard userId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

function TreeNode({
  node, depth, online, matches, query, onOpen, defaultOpen,
}: {
  node: OrgNode;
  depth: number;
  online: Set<string>;
  matches: Set<string> | null;
  query: string;
  onOpen: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const hasChildren = node.children.length > 0;
  const highlighted = matches?.has(node.user.id);
  const dimmed = !!matches && matches.size > 0 && !highlighted;

  return (
    <div className={cn(dimmed && 'opacity-40')}>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-xl border p-2 transition bordered',
          highlighted ? 'border-brand-400 bg-brand-50/70 dark:bg-brand-500/15' : 'bg-[rgb(var(--surface))] hover:border-brand-200',
        )}
        style={{ marginLeft: depth * 20 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-ink-100 dark:hover:bg-white/10"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        <button type="button" onClick={() => onOpen(node.user.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar name={node.user.name} color={node.user.avatarColor} url={node.user.avatarUrl} size={34} online={online.has(node.user.id)} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-bold">{node.user.name}</span>
              <Badge tone={ROLE_TONE[node.role] || 'neutral'}>{node.role}</Badge>
            </span>
            <span className="block truncate text-[11px] text-muted">
              {node.user.position || '—'}
              {node.user.department && <span className="text-ink-400"> · {node.user.department}</span>}
            </span>
          </span>
          {hasChildren && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--surface-3))] px-2 py-0.5 text-[10px] font-bold text-muted sm:flex">
              <Users size={9} /> {node.children.length}
            </span>
          )}
          <Link
            to={`/profile/${node.user.id}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-white/10 sm:block"
            aria-label={`Open ${node.user.name}'s profile`}
          >
            <UserRound size={14} />
          </Link>
          <a
            href={`mailto:${node.user.email}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-white/10 sm:block"
            aria-label={`Email ${node.user.name}`}
          >
            <Mail size={14} />
          </a>
        </button>
      </div>

      {open && hasChildren && (
        <div className="mt-1.5 space-y-1.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.user.id}
              node={child}
              depth={depth + 1}
              online={online}
              matches={matches}
              query={query}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
