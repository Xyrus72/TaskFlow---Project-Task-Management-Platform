import { useState } from 'react';
import { UserMinus, UserPlus } from 'lucide-react';
import { api } from '../../api';
import { useAuth, toast, confirmDialog } from '../../store';
import { Avatar, Badge, Button, Picker, RoleBadge } from '../../components';
import { AddMemberModal } from '../../modals';
import { atLeast, PROJECT_ROLES } from '../../utils';

const ROLE_OPTIONS = ['manager', 'member', 'viewer'].map((r) => ({ value: r, label: PROJECT_ROLES[r].label }));

/** Project members and project-level permissions (RBAC). Managers can add, re-role and remove people. */
export default function Members({ project, onChange }) {
  const me = useAuth((s) => s.user);
  const canManage = atLeast(project.my_role, 'manager');
  const [adding, setAdding] = useState(false);

  const setRole = async (m, role) => {
    try {
      onChange(await api(`/projects/${project.id}/members`, { method: 'POST', body: { userId: m.id, role } }));
      toast(`${m.name} is now a ${role}`);
    } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (m) => {
    const ok = await confirmDialog({
      title: `Remove ${m.name}?`, danger: true, confirmLabel: 'Remove member',
      message: `${m.name} will lose access to “${project.name}”. Open tasks assigned to them will become unassigned.`,
    });
    if (!ok) return;
    try { onChange(await api(`/projects/${project.id}/members/${m.id}`, { method: 'DELETE' })); toast(`${m.name} was removed`); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="dash-grid" style={{ marginTop: 0 }}>
      <section className="card">
        <div className="card-header">
          <div><h2>Members</h2><p>{project.members.length} people can see this project</p></div>
          {canManage && <Button variant="primary" size="sm" icon={UserPlus} onClick={() => setAdding(true)}>Add member</Button>}
        </div>
        {project.members.map((m) => {
          const editable = canManage && m.role !== 'owner' && m.id !== me.id;
          return (
            <div key={m.id} className="member-row">
              <Avatar name={m.name} size="lg" />
              <div className="who">
                <div className="name">{m.name}{m.id === me.id && <span className="faint" style={{ fontWeight: 400 }}> (you)</span>}</div>
                <div className="email truncate">{m.email}</div>
              </div>
              {editable
                ? <Picker size="sm" value={m.role} options={ROLE_OPTIONS} onChange={(r) => setRole(m, r)} label={`Role of ${m.name}`} align="end" />
                : <RoleBadge role={m.role} />}
              {editable && <Button variant="ghost" size="sm" icon={UserMinus} onClick={() => remove(m)} aria-label={`Remove ${m.name}`} title="Remove from project" />}
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-header"><div><h2>What each role can do</h2><p>Workspace admins can open every project.</p></div></div>
        <div className="card-body role-help">
          {Object.entries(PROJECT_ROLES).map(([key, r]) => (
            <div key={key} className="rh">
              <span style={{ width: 84, flex: 'none' }}><RoleBadge role={key} /></span>
              <p>{r.desc}</p>
            </div>
          ))}
          {!canManage && <Badge>Only managers and the owner can change members</Badge>}
        </div>
      </section>

      <AddMemberModal open={adding} onClose={() => setAdding(false)} title="Add a project member"
        description="They’ll see this board and get the permissions of the role you choose."
        excludeIds={project.members.map((m) => m.id)} defaultRole="member"
        roles={['member', 'viewer', 'manager'].map((r) => ({ value: r, label: PROJECT_ROLES[r].label, desc: PROJECT_ROLES[r].desc }))}
        onAdd={async (userId, role) => {
          const p = await api(`/projects/${project.id}/members`, { method: 'POST', body: { userId, role } });
          onChange(p);
          toast(`${p.members.find((m) => m.id === userId)?.name || 'Member'} added as ${role}`);
        }} />
    </div>
  );
}
