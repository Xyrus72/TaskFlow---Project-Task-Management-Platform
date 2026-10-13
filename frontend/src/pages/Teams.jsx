import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { useDocumentTitle, useFetch } from '../hooks';
import { AvatarStack, Button, EmptyState, ErrorState, RoleBadge, Skeleton } from '../components';
import { TeamFormModal } from '../modals';
import { avatarColors, plural } from '../utils';

export default function Teams() {
  useDocumentTitle('Teams');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useFetch('/teams');
  const teams = data?.data;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Teams</h1>
          <p className="page-desc">Teams group people so you can add all of them to a project at once.</p>
        </div>
        <div className="actions"><Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New team</Button></div>
      </div>

      {error && <div className="card"><ErrorState error={error} onRetry={reload} /></div>}
      {!teams && !error && (
        <div className="project-grid">{[0, 1, 2].map((i) => <div key={i} className="card project-card"><Skeleton w="50%" h={18} /><Skeleton h={36} /><Skeleton w="40%" /></div>)}</div>
      )}
      {teams?.length === 0 && (
        <div className="card">
          <EmptyState icon={Users} title="Create your first team" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New team</Button>}>
            Add your colleagues to a team, then share projects with the whole team in one step.
          </EmptyState>
        </div>
      )}
      {teams?.length > 0 && (
        <div className="project-grid">
          {teams.map((t) => {
            const [bg, fg] = avatarColors(t.name);
            return (
              <Link key={t.id} to={`/teams/${t.id}`} className="card project-card">
                <div className="pc-head">
                  <span className="project-icon tinted" style={{ '--av-bg': bg, '--av-fg': fg }}>{t.name[0].toUpperCase()}</span>
                  <div className="grow">
                    <h3 className="truncate">{t.name}</h3>
                    <div className="text-sm muted">{plural(t.member_count, 'member')} · {plural(t.project_count, 'project')}</div>
                  </div>
                  {t.my_role ? <RoleBadge role={t.my_role} /> : <RoleBadge role="admin" />}
                </div>
                <p className="desc">{t.description || 'No description yet.'}</p>
                <div className="pc-foot">
                  <AvatarStack users={t.members_preview} total={t.member_count} />
                  <span className="link text-sm">Open team</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <TeamFormModal open={creating} onClose={() => setCreating(false)} onSaved={(t) => { setCreating(false); navigate(`/teams/${t.id}`); }} />
    </div>
  );
}
