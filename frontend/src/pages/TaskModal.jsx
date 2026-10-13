import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SquarePen } from 'lucide-react';
import { api } from '../api';
import { useBoard, toast } from '../store';
import { useFetch } from '../hooks';
import { Avatar, Button, Field, Modal, Picker, PriorityIcon, StatusIcon } from '../components';
import { atLeast, PRIORITIES, STATUSES, taskKey } from '../utils';
import { LabelField } from '../labels';

const empty = (status) => ({ title: '', description: '', status: status || 'todo', priority: 'medium', assigneeId: '', dueDate: '', labelIds: [] });

/** Create a task. Without a projectId it lets you pick one of the projects you can edit. */
export default function NewTaskModal({ open, onClose, projectId, defaultStatus }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(empty(defaultStatus));
  const [pid, setPid] = useState(projectId || '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const projects = useFetch('/projects', { limit: 100, sort: 'name', order: 'asc' }, { enabled: open && !projectId });
  const members = useFetch(pid ? `/projects/${pid}/members` : null, null, { enabled: open && !!pid });
  const labels = useFetch(pid ? `/projects/${pid}/labels` : null, null, { enabled: open && !!pid });

  useEffect(() => {
    if (open) { setForm(empty(defaultStatus)); setErrors({}); setPid(projectId || ''); }
  }, [open, projectId, defaultStatus]);

  const editable = (projects.data?.data || []).filter((p) => atLeast(p.my_role, 'member'));
  useEffect(() => { if (open && !projectId && !pid && editable.length) setPid(editable[0].id); }, [open, projectId, pid, editable]);

  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined })); };

  const submit = async () => {
    if (!form.title.trim()) { setErrors({ title: 'Give the task a title' }); return; }
    if (!pid) { setErrors({ project: 'Choose a project' }); return; }
    setBusy(true);
    try {
      const task = await api(`/projects/${pid}/tasks`, {
        method: 'POST',
        body: { ...form, assigneeId: form.assigneeId ? Number(form.assigneeId) : null, dueDate: form.dueDate || null },
      });
      useBoard.getState().upsert(task);
      toast(`Created ${taskKey(task.id)}`, 'success', { label: 'Open', onClick: () => navigate(`/projects/${task.project_id}?task=${task.id}`) });
      onClose();
    } catch (e) {
      if (e.details) setErrors(e.fields); else toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const memberOptions = [
    { value: '', label: 'Unassigned', icon: <Avatar size="xs" /> },
    ...(members.data?.data || []).map((m) => ({ value: m.id, label: m.name, icon: <Avatar name={m.name} size="xs" /> })),
  ];

  return (
    <Modal open={open} onClose={onClose} as="form" onSubmit={submit} icon={SquarePen} title="New task" size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Create task</Button></>}>
      <div className="stack">
        {!projectId && (
          <Field label="Project" error={errors.project} htmlFor="nt-project">
            <select id="nt-project" className="select" value={pid} onChange={(e) => { setPid(Number(e.target.value)); set('assigneeId')(''); set('labelIds')([]); }}>
              {editable.length === 0 && <option value="">You can't add tasks to any project yet</option>}
              {editable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Title" error={errors.title} htmlFor="nt-title">
          <input id="nt-title" className={`input ${errors.title ? 'invalid' : ''}`} value={form.title} onChange={(e) => set('title')(e.target.value)}
            placeholder="What needs to be done?" maxLength={200} data-autofocus />
        </Field>
        <Field label="Description" optional error={errors.description} htmlFor="nt-desc">
          <textarea id="nt-desc" className="textarea" style={{ minHeight: 88 }} value={form.description} onChange={(e) => set('description')(e.target.value)}
            placeholder="Add details, links or acceptance criteria" maxLength={5000} />
        </Field>
        <div className="form-grid">
          <Field label="Status">
            <Picker value={form.status} onChange={set('status')} label="Status"
              options={STATUSES.map((s) => ({ value: s.key, label: s.label, icon: <StatusIcon status={s.key} /> }))} />
          </Field>
          <Field label="Priority">
            <Picker value={form.priority} onChange={set('priority')} label="Priority"
              options={PRIORITIES.map((p) => ({ value: p.key, label: p.label, icon: <PriorityIcon priority={p.key} /> }))} />
          </Field>
          <Field label="Assignee" error={errors.assigneeId}>
            <Picker value={form.assigneeId} onChange={set('assigneeId')} label="Assignee" options={memberOptions} disabled={!pid} />
          </Field>
          <Field label="Due date" error={errors.dueDate} htmlFor="nt-due">
            <input id="nt-due" type="date" className={`input ${errors.dueDate ? 'invalid' : ''}`} value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
          </Field>
        </div>
        <Field label="Labels" optional error={errors.labelIds}>
          <div className="label-input">
            <LabelField projectId={pid} labels={labels.data?.data || []} value={form.labelIds} onChange={set('labelIds')} canEdit={!!pid} canCreate
              onCreated={(l) => labels.setData((d) => ({ ...d, data: [...(d?.data || []), l] }))} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
