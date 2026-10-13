import { useEffect, useState } from 'react';
import { Check, FolderPlus, Search, UserPlus, Users } from 'lucide-react';
import { api } from './api';
import { toast } from './store';
import { useDebounced, useFetch } from './hooks';
import { Avatar, Button, Field, Modal, Spinner } from './components';

/** Shared form state + server-error mapping for the small create/edit dialogs. */
function useForm(initial, open) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setValues(initial); setErrors({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const bind = (key) => ({
    value: values[key] ?? '',
    onChange: (e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setErrors((er) => ({ ...er, [key]: undefined })); },
    className: `${errors[key] ? 'invalid' : ''}`,
  });
  const submit = (fn) => async () => {
    setBusy(true);
    try { await fn(values); } catch (e) {
      if (e.details) setErrors(e.fields); else toast(e.message, 'error');
    } finally { setBusy(false); }
  };
  return { values, setValues, errors, setErrors, busy, bind, submit };
}

export function NewProjectModal({ open, onClose, defaultTeamId, onCreated }) {
  const teams = useFetch('/teams', null, { enabled: open });
  const f = useForm({ name: '', description: '', teamId: defaultTeamId ? String(defaultTeamId) : '' }, open);
  const myTeams = (teams.data?.data || []).filter((t) => t.my_role);
  const create = f.submit(async (v) => {
    if (v.name.trim().length < 2) { f.setErrors({ name: 'Give the project a name (at least 2 characters)' }); return; }
    const p = await api('/projects', { method: 'POST', body: { name: v.name, description: v.description, teamId: v.teamId ? Number(v.teamId) : null } });
    toast(`Project “${p.name}” created`);
    onCreated(p);
  });
  return (
    <Modal open={open} onClose={onClose} as="form" onSubmit={create} icon={FolderPlus} title="New project"
      description="Projects hold a Kanban board, members and their roles."
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={f.busy}>Create project</Button></>}>
      <div className="stack">
        <Field label="Project name" error={f.errors.name} htmlFor="np-name">
          <input id="np-name" {...f.bind('name')} className={`input ${f.bind('name').className}`} placeholder="Website redesign" maxLength={100} />
        </Field>
        <Field label="Description" optional error={f.errors.description} htmlFor="np-desc">
          <textarea id="np-desc" {...f.bind('description')} className="textarea" style={{ minHeight: 80 }} placeholder="What is this project about?" maxLength={2000} />
        </Field>
        <Field label="Team" optional hint="Everyone in the team joins the project as a member." htmlFor="np-team">
          <select id="np-team" className="select" value={f.values.teamId} onChange={(e) => f.setValues((v) => ({ ...v, teamId: e.target.value }))}>
            <option value="">No team (just you)</option>
            {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.member_count} members</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export function TeamFormModal({ open, onClose, team, onSaved }) {
  const editing = !!team;
  const f = useForm({ name: team?.name || '', description: team?.description || '' }, open);
  const save = f.submit(async (v) => {
    if (v.name.trim().length < 2) { f.setErrors({ name: 'Give the team a name (at least 2 characters)' }); return; }
    const t = await api(editing ? `/teams/${team.id}` : '/teams', { method: editing ? 'PATCH' : 'POST', body: v });
    toast(editing ? 'Team updated' : `Team “${t.name}” created`);
    onSaved(t);
  });
  return (
    <Modal open={open} onClose={onClose} as="form" onSubmit={save} icon={Users} title={editing ? 'Edit team' : 'New team'}
      description={editing ? undefined : 'Teams group people so you can share projects with all of them at once.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={f.busy}>{editing ? 'Save changes' : 'Create team'}</Button></>}>
      <div className="stack">
        <Field label="Team name" error={f.errors.name} htmlFor="tm-name">
          <input id="tm-name" {...f.bind('name')} className={`input ${f.bind('name').className}`} placeholder="Product engineering" maxLength={80} />
        </Field>
        <Field label="Description" optional error={f.errors.description} htmlFor="tm-desc">
          <textarea id="tm-desc" {...f.bind('description')} className="textarea" style={{ minHeight: 80 }} placeholder="What does this team work on?" maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Pick a registered user and a role. Used for both project members and team members.
 * roles: [{ value, label, desc }]
 */
export function AddMemberModal({ open, onClose, title, description, excludeIds = [], roles, defaultRole, onAdd }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState(defaultRole);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search, 200);
  const users = useFetch('/users', { search: q }, { enabled: open });
  useEffect(() => { if (open) { setSearch(''); setSelected(null); setRole(defaultRole); } }, [open, defaultRole]);
  const list = (users.data?.data || []).filter((u) => !excludeIds.includes(u.id));

  const add = async () => {
    if (!selected) return toast('Choose a person to add', 'error');
    setBusy(true);
    try { await onAdd(selected.id, role); onClose(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} icon={UserPlus} title={title} description={description} size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!selected} onClick={add}>Add {selected ? selected.name.split(' ')[0] : 'member'}</Button></>}>
      <div className="stack">
        <div className="input-icon">
          <Search aria-hidden />
          <input className="input" placeholder="Search people by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
        </div>
        <div className="card" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {users.loading && !users.data && <div className="loading-block" style={{ padding: 24 }}><Spinner /></div>}
          {users.data && list.length === 0 && <p className="muted text-sm" style={{ padding: 16 }}>{search ? 'Nobody matches that search.' : 'Everyone is already a member.'}</p>}
          {list.map((u) => (
            <button key={u.id} type="button" className="member-row" onClick={() => setSelected(u)}
              style={{ width: '100%', border: 0, background: selected?.id === u.id ? 'var(--primary-50)' : 'none', textAlign: 'left' }}>
              <Avatar name={u.name} size="lg" />
              <span className="who"><span className="name" style={{ display: 'block' }}>{u.name}</span><span className="email">{u.email}</span></span>
              {selected?.id === u.id && <Check width={18} height={18} color="var(--primary)" aria-hidden />}
            </button>
          ))}
        </div>
        <Field label="Role">
          <div className="stack-sm">
            {roles.map((r) => (
              <label key={r.value} className="row" style={{ alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${role === r.value ? 'var(--primary-200)' : 'var(--border)'}`, background: role === r.value ? 'var(--primary-50)' : 'var(--surface)', cursor: 'pointer' }}>
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} style={{ marginTop: 3 }} />
                <span><span className="strong">{r.label}</span><span className="muted text-sm" style={{ display: 'block' }}>{r.desc}</span></span>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
