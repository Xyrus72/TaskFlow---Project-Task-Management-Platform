import { useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { api } from './api';
import { toast } from './store';
import { Button, ProgressBar } from './components';
import { pct } from './utils';

function Item({ item, taskId, canEdit, onTask }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const call = async (method, body) => {
    try { onTask(await api(`/tasks/${taskId}/checklist/${item.id}`, { method, body })); } catch (e) { toast(e.message, 'error'); }
  };
  const save = () => {
    setEditing(false);
    const t = text.trim();
    if (!t) { setText(item.text); return; }
    if (t !== item.text) call('PATCH', { text: t });
  };
  return (
    <li className={`check-item ${item.done ? 'done' : ''}`}>
      <button type="button" className={`checkbox ${item.done ? 'on' : ''}`} disabled={!canEdit} role="checkbox" aria-checked={item.done}
        aria-label={item.done ? `Mark “${item.text}” as not done` : `Mark “${item.text}” as done`} onClick={() => call('PATCH', { done: !item.done })}>
        {item.done && <Check aria-hidden />}
      </button>
      {editing ? (
        <input className="input input-sm grow" autoFocus value={text} maxLength={200} aria-label="Edit step"
          onChange={(e) => setText(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setText(item.text); setEditing(false); } }} />
      ) : (
        <span className="check-text grow" role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
          onClick={() => canEdit && setEditing(true)} onKeyDown={(e) => { if (canEdit && e.key === 'Enter') setEditing(true); }}>
          {item.text}
        </span>
      )}
      {canEdit && !editing && <Button variant="ghost" size="sm" icon={Trash2} className="check-remove" onClick={() => call('DELETE')} aria-label={`Remove “${item.text}”`} />}
    </li>
  );
}

/** Subtask checklist for a task. `onTask` receives the updated task after every change. */
export default function Checklist({ task, canEdit, onTask }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const items = task.checklist || [];
  const done = items.filter((i) => i.done).length;

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      onTask(await api(`/tasks/${task.id}/checklist`, { method: 'POST', body: { text } }));
      setDraft('');
      inputRef.current?.focus();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!items.length && !canEdit) return null;
  return (
    <div className="td-section">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Checklist</h3>
        {items.length > 0 && <span className="text-sm muted nums">{done} of {items.length} done</span>}
      </div>
      {items.length > 0 && <ProgressBar value={pct(done, items.length)} tone={done === items.length ? 'green' : ''} />}
      <ul className="checklist">
        {items.map((i) => <Item key={i.id} item={i} taskId={task.id} canEdit={canEdit} onTask={onTask} />)}
      </ul>
      {canEdit && (
        <div className="row" style={{ marginTop: 8 }}>
          <input ref={inputRef} className="input input-sm grow" value={draft} placeholder={items.length ? 'Add another step' : 'Break this task into steps'} maxLength={200}
            aria-label="New checklist step" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button size="sm" onClick={add} loading={busy} disabled={!draft.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}
