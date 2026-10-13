import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tag, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useBoard, toast, confirmDialog } from '../../store';
import { useFetch } from '../../hooks';
import { Button, Field, Popover, Skeleton } from '../../components';
import { LABEL_COLOR_KEYS, LABEL_COLORS, nextLabelColor, plural } from '../../utils';

function ColorSwatch({ value, onChange, name }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  return (
    <>
      <button ref={anchor} type="button" className="swatch-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
        aria-label={`Colour of ${name}: ${value}. Change colour`} title="Change colour">
        <span style={{ background: (LABEL_COLORS[value] || LABEL_COLORS.gray).dot }} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={0}>
        <div className="swatches">
          {LABEL_COLOR_KEYS.map((k) => (
            <button key={k} type="button" className={`swatch ${k === value ? 'on' : ''}`} style={{ background: LABEL_COLORS[k].dot }}
              aria-label={k} aria-pressed={k === value} title={k[0].toUpperCase() + k.slice(1)} onClick={() => { setOpen(false); if (k !== value) onChange(k); }} />
          ))}
        </div>
      </Popover>
    </>
  );
}

function LabelRow({ label, onPatch, onRemove }) {
  const [name, setName] = useState(label.name);
  useEffect(() => setName(label.name), [label.name]);
  const save = async () => {
    const n = name.trim();
    if (!n || n === label.name) { setName(label.name); return; }
    if (!(await onPatch(label, { name: n }))) setName(label.name);
  };
  return (
    <li className="label-row">
      <ColorSwatch value={label.color} name={label.name} onChange={(color) => onPatch(label, { color })} />
      <input className="input input-sm grow" value={name} maxLength={30} aria-label={`Name of the ${label.name} label`}
        onChange={(e) => setName(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setName(label.name); } }} />
      <span className="text-sm muted nums label-count">{plural(label.task_count, 'task')}</span>
      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onRemove(label)} aria-label={`Delete the ${label.name} label`} title="Delete label" />
    </li>
  );
}

/** Create, rename, recolour and delete the project's labels. */
function LabelsCard({ project, onChanged }) {
  const { data, setData } = useFetch(`/projects/${project.id}/labels`);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const labels = data?.data;
  const changed = () => { onChanged(); useBoard.getState().load({ silent: true }); };

  const add = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const l = await api(`/projects/${project.id}/labels`, { method: 'POST', body: { name: n, color: nextLabelColor(labels || []) } });
      setData((d) => ({ ...d, data: [...d.data, { ...l, task_count: 0 }] }));
      setName('');
      changed();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const patch = async (label, body) => {
    try {
      const u = await api(`/projects/${project.id}/labels/${label.id}`, { method: 'PATCH', body });
      setData((d) => ({ ...d, data: d.data.map((l) => (l.id === label.id ? { ...l, ...u } : l)) }));
      changed();
      return true;
    } catch (err) { toast(err.message, 'error'); return false; }
  };
  const remove = async (label) => {
    const ok = await confirmDialog({
      title: `Delete the “${label.name}” label?`, danger: true, confirmLabel: 'Delete label',
      message: label.task_count ? `It will be taken off ${plural(label.task_count, 'task')}. The tasks themselves are not affected.` : 'No tasks use this label.',
    });
    if (!ok) return;
    try {
      await api(`/projects/${project.id}/labels/${label.id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, data: d.data.filter((l) => l.id !== label.id) }));
      changed();
      toast('Label deleted');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="card">
      <div className="card-header"><div><h2>Labels</h2><p>Tag tasks by type or area, like Bug, Design or Blocked. Anyone who can edit tasks can apply them.</p></div></div>
      <div className="card-body">
        <form className="row" onSubmit={add} style={{ maxWidth: 480 }}>
          <input className="input input-sm grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="New label name" maxLength={30} aria-label="New label name" />
          <Button type="submit" size="sm" icon={Plus} loading={busy} disabled={!name.trim()}>Add label</Button>
        </form>
        {!labels && <div className="stack-sm" style={{ marginTop: 16 }}><Skeleton h={34} /><Skeleton h={34} /></div>}
        {labels?.length === 0 && <p className="muted text-sm row" style={{ marginTop: 16 }}><Tag width={15} height={15} aria-hidden />No labels yet.</p>}
        {labels?.length > 0 && (
          <ul className="label-rows">
            {labels.map((l) => <LabelRow key={l.id} label={l} onPatch={patch} onRemove={remove} />)}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Edit a project's details (manager+) and delete it (owner). */
export default function ProjectSettings({ project, onSaved }) {
  const navigate = useNavigate();
  const teams = useFetch('/teams');
  const initial = { name: project.name, description: project.description || '', teamId: project.team_id ?? '' };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const dirty = form.name !== initial.name || form.description !== initial.description || String(form.teamId) !== String(initial.teamId);
  const isOwner = project.my_role === 'owner';

  const save = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { setErrors({ name: 'Give the project a name (at least 2 characters)' }); return; }
    setBusy(true);
    try {
      const p = await api(`/projects/${project.id}`, { method: 'PATCH', body: { name: form.name, description: form.description, teamId: form.teamId ? Number(form.teamId) : null } });
      onSaved(p);
      setErrors({});
      toast('Project updated');
      window.dispatchEvent(new Event('tf:projects-changed'));
    } catch (err) { if (err.details) setErrors(err.fields); else toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const remove = async () => {
    const fresh = await api(`/projects/${project.id}`).catch(() => project);
    const ok = await confirmDialog({
      title: `Delete “${project.name}”?`, danger: true, confirmLabel: 'Delete project',
      message: `This permanently deletes the project, its ${plural(fresh.task_count, 'task')}, their comments and the full history. This can't be undone.`,
    });
    if (!ok) return;
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      toast('Project deleted');
      window.dispatchEvent(new Event('tf:projects-changed'));
      navigate('/projects');
    } catch (e) { toast(e.message, 'error'); }
  };

  const teamOptions = (teams.data?.data || []).filter((t) => t.my_role || t.id === project.team_id);

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 920 }}>
      <form className="card" onSubmit={save} noValidate>
        <div className="card-header"><div><h2>General</h2><p>Visible to everyone in the project</p></div></div>
        <div className="card-body stack">
          <Field label="Project name" error={errors.name} htmlFor="ps-name">
            <input id="ps-name" className={`input ${errors.name ? 'invalid' : ''}`} value={form.name} maxLength={100}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({}); }} />
          </Field>
          <Field label="Description" optional error={errors.description} htmlFor="ps-desc">
            <textarea id="ps-desc" className="textarea" value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Team" optional hint="Moving a project to another team doesn't change who its members are." htmlFor="ps-team">
            <select id="ps-team" className="select" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              <option value="">No team</option>
              {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="card-footer form-actions">
          <Button disabled={!dirty || busy} onClick={() => { setForm(initial); setErrors({}); }}>Reset</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>Save changes</Button>
        </div>
      </form>

      <LabelsCard project={project} onChanged={() => api(`/projects/${project.id}`).then(onSaved).catch(() => {})} />

      <section className="card danger-zone">
        <div className="card-header"><div><h2>Delete project</h2><p>Permanently remove the project and everything in it.</p></div></div>
        <div className="card-body row-between">
          <p className="muted text-sm" style={{ maxWidth: 520 }}>
            {isOwner ? 'Only you, the owner, can do this. Members will lose access immediately.' : `Only the owner (${project.owner_name}) can delete this project.`}
          </p>
          <Button variant="danger" icon={Trash2} disabled={!isOwner} onClick={remove}>Delete project</Button>
        </div>
      </section>
    </div>
  );
}
