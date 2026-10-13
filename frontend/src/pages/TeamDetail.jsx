import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Ellipsis, FolderKanban, LogOut, Pencil, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { api } from '../api';
import { useAuth, useUI, toast, confirmDialog } from '../store';
import { useDocumentTitle, useFetch } from '../hooks';
import { Avatar, Button, EmptyState, ErrorState, LoadingBlock, Menu, Picker, ProgressBar, ProjectIcon, RoleBadge } from '../components';
import { AddMemberModal, TeamFormModal } from '../modals';
import { avatarColors, pct, plural } from '../utils';

const TEAM_ROLES = [
  { value: 'lead', label: 'Lead', desc: 'Manages the team: adds and removes members, edits and deletes the team.' },
  { value: 'member', label: 'Member', desc: 'Joins every project created for the team.' },
];

export default function TeamDetail() {
  const { id } = useParams();
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const openNewProject = useUI((s) => s.openNewProject);
  const { data: team, error, reload, setData } = useFetch(`/teams/${id}`);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  useDocumentTitle(team?.name);

  if (error) return <div className="page"><div className="card"><ErrorState error={error} onRetry={reload} /></div><p style={{ marginTop: 16 }}><Link className="link" to="/teams">Back to teams</Link></p></div>;
  if (!team) return <div className="page"><LoadingBlock /></div>;

  const lead = team.can_manage;
  const isMember = !!team.my_role;
  const [bg, fg] = avatarColors(team.name);

  const setRole = async (m, role) => {
    try { setData(await api(`/teams/${team.id}/members/${m.id}`, { method: 'PATCH', body: { role } })); toast(`${m.name} is now a ${role}`); }
    catch (e) { toast(e.message, 'error'); }
  };
  const removeMember = async (m) => {
    const self = m.id === me.id;
    const ok = await confirmDialog({
      title: self ? `Leave ${team.name}?` : `Remove ${m.name}?`, danger: true, confirmLabel: self ? 'Leave team' : 'Remove member',
      message: self ? 'You keep access to projects you are already a member of.' : `${m.name} will be removed from the team. They keep access to projects they already joined.`,
    });
    if (!ok) return;
    try {
      const t = await api(`/teams/${team.id}/members/${m.id}`, { method: 'DELETE' });
      if (self) { toast(`You left ${team.name}`); navigate('/teams'); } else { setData(t); toast(`${m.name} was removed`); }
    } catch (e) { toast(e.message, 'error'); }
  };
  const deleteTeam = async () => {
    const ok = await confirmDialog({
      title: `Delete ${team.name}?`, danger: true, confirmLabel: 'Delete team',
      message: `The team is deleted. Its ${plural(team.project_count, 'project')} stay, without a team, and keep their members.`,
    });
    if (!ok) return;
    try { await api(`/teams/${team.id}`, { method: 'DELETE' }); toast('Team deleted'); navigate('/teams'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/teams">Teams</Link><ChevronRight aria-hidden /><span>{team.name}</span></nav>
      <div className="page-header">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <span className="project-icon tinted" style={{ width: 44, height: 44, '--av-bg': bg, '--av-fg': fg }}>{team.name[0].toUpperCase()}</span>
          <div>
            <div className="page-title"><h1>{team.name}</h1><RoleBadge role={team.my_role || 'admin'} /></div>
            <p className="page-desc">{team.description || 'No description yet.'}</p>
          </div>
        </div>
        <div className="actions">
          {isMember && <Button icon={Plus} onClick={() => openNewProject({ teamId: team.id })}>New project</Button>}
          {lead && <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>Add member</Button>}
          {(lead || isMember) && (
            <Menu trigger={(p) => <Button icon={Ellipsis} aria-label="Team actions" {...p} />} items={[
              lead && { label: 'Edit team', icon: Pencil, onSelect: () => setEditing(true) },
              isMember && { label: 'Leave team', icon: LogOut, onSelect: () => removeMember({ id: me.id, name: me.name }) },
              lead && { divider: true },
              lead && { label: 'Delete team', icon: Trash2, danger: true, onSelect: deleteTeam },
            ]} />
          )}
        </div>
      </div>

      <div className="dash-grid" style={{ marginTop: 0 }}>
        <section className="card">
          <div className="card-header"><div><h2>Members</h2><p>{plural(team.member_count, 'person', 'people')} in this team</p></div></div>
          {team.members.map((m) => (
            <div key={m.id} className="member-row">
              <Avatar name={m.name} size="lg" />
              <div className="who">
                <div className="name">{m.name}{m.id === me.id && <span className="faint" style={{ fontWeight: 400 }}> (you)</span>}</div>
                <div className="email truncate">{m.email}</div>
              </div>
              {lead
                ? <Picker size="sm" value={m.role} align="end" label={`Role of ${m.name}`} onChange={(r) => setRole(m, r)} options={TEAM_ROLES.map((r) => ({ value: r.value, label: r.label }))} />
                : <RoleBadge role={m.role} />}
              {lead && m.id !== me.id && <Button variant="ghost" size="sm" icon={UserMinus} onClick={() => removeMember(m)} aria-label={`Remove ${m.name}`} title="Remove from team" />}
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-header">
            <div><h2>Projects</h2><p>New projects in this team include every member</p></div>
            {isMember && <Button size="sm" icon={Plus} onClick={() => openNewProject({ teamId: team.id })}>New</Button>}
          </div>
          {team.projects.length === 0
            ? <EmptyState small icon={FolderKanban} title="No projects yet">Create a project for this team to get everyone on one board.</EmptyState>
            : team.projects.map((p) => {
              const v = pct(p.done_count, p.task_count);
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="project-row">
                  <span className="row" style={{ gap: 12, minWidth: 0 }}>
                    <ProjectIcon id={p.id} name={p.name} size={34} />
                    <span style={{ minWidth: 0 }}>
                      <span className="strong truncate" style={{ display: 'block' }}>{p.name}</span>
                      <span className="text-xs muted">{p.done_count} of {plural(p.task_count, 'task')} done</span>
                    </span>
                  </span>
                  <span><span className="progress-label"><span /><b>{v}%</b></span><ProgressBar value={v} tone={v === 100 ? 'green' : ''} /></span>
                </Link>
              );
            })}
        </section>
      </div>

      <TeamFormModal open={editing} onClose={() => setEditing(false)} team={team} onSaved={(t) => { setEditing(false); setData(t); }} />
      <AddMemberModal open={adding} onClose={() => setAdding(false)} title={`Add someone to ${team.name}`}
        description="Members join every new project created for this team." excludeIds={team.members.map((m) => m.id)}
        roles={TEAM_ROLES} defaultRole="member"
        onAdd={async (userId, role) => {
          const t = await api(`/teams/${team.id}/members`, { method: 'POST', body: { userId, role } });
          setData(t);
          toast(`${t.members.find((m) => m.id === userId)?.name || 'Member'} added to the team`);
        }} />
    </div>
  );
}
