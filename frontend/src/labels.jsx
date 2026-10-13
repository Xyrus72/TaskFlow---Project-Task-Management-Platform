import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Search, Tag } from 'lucide-react';
import { api } from './api';
import { toast } from './store';
import { Popover } from './components';
import { LABEL_COLORS, nextLabelColor } from './utils';

export function LabelChip({ label, small }) {
  const c = LABEL_COLORS[label.color] || LABEL_COLORS.gray;
  return (
    <span className={`label-chip ${small ? 'sm' : ''}`} style={{ '--lc-bg': c.bg, '--lc-fg': c.fg, '--lc-dot': c.dot }} title={label.name}>
      <span className="label-dot" style={{ background: c.dot }} /><span className="truncate">{label.name}</span>
    </span>
  );
}

export function LabelList({ labels, small, max }) {
  if (!labels?.length) return null;
  const shown = max ? labels.slice(0, max) : labels;
  return (
    <span className="label-list">
      {shown.map((l) => <LabelChip key={l.id} label={l} small={small} />)}
      {max && labels.length > max && <span className="label-chip sm label-more">+{labels.length - max}</span>}
    </span>
  );
}

/**
 * Tick labels on and off, and (with canCreate) create a new label from the search text.
 * `labels` are the project's labels; `value` is the selected label ids.
 */
export function LabelPicker({ projectId, labels, value, onChange, canCreate, onCreated, disabled, children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const anchor = useRef(null);
  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);

  const q = query.trim();
  const shown = q ? labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())) : labels;
  const canMake = canCreate && q && !labels.some((l) => l.name.toLowerCase() === q.toLowerCase());
  const options = [...shown.map((l) => ({ kind: 'label', l })), ...(canMake ? [{ kind: 'create' }] : [])];

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const create = async () => {
    setBusy(true);
    try {
      const label = await api(`/projects/${projectId}/labels`, { method: 'POST', body: { name: q, color: nextLabelColor(labels) } });
      onCreated?.(label);
      onChange([...value, label.id]);
      // Let the open project page (label filter) know right away instead of waiting for the live update.
      window.dispatchEvent(new CustomEvent('tf:change', { detail: { action: 'project.labels', projectId: Number(projectId) } }));
      setQuery('');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const choose = (o) => (o.kind === 'create' ? create() : toggle(o.l.id));
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && options[active]) { e.preventDefault(); choose(options[active]); }
  };

  return (
    <>
      <button ref={anchor} type="button" className="label-trigger" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label="Labels">
        {children}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={240}>
        <div className="popover-search input-icon">
          <Search aria-hidden style={{ left: 15 }} />
          <input className="input input-sm" autoFocus value={query} placeholder={canCreate ? 'Find or create a label' : 'Find a label'}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} aria-label="Find a label" style={{ paddingLeft: 32 }} />
        </div>
        <div className="popover-list" role="listbox" aria-multiselectable="true">
          {!labels.length && !canMake && <div className="menu-empty">{canCreate ? 'No labels yet. Type a name to create one.' : 'This project has no labels yet.'}</div>}
          {labels.length > 0 && !options.length && <div className="menu-empty">No labels match.</div>}
          {options.map((o, i) => (o.kind === 'label' ? (
            <button key={o.l.id} type="button" role="option" aria-selected={value.includes(o.l.id)}
              className={`menu-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              <span className={`checkbox ${value.includes(o.l.id) ? 'on' : ''}`}>{value.includes(o.l.id) && <Check aria-hidden />}</span>
              <LabelChip label={o.l} small />
            </button>
          ) : (
            <button key="create" type="button" className={`menu-item ${i === active ? 'active' : ''}`} disabled={busy} onMouseEnter={() => setActive(i)} onClick={create}>
              <Plus aria-hidden />Create label “{q}”
            </button>
          )))}
        </div>
      </Popover>
    </>
  );
}

/** Inline "labels" value for forms and the task drawer: chips plus an add button. */
export function LabelField({ projectId, labels, value, onChange, canEdit, canCreate, onCreated }) {
  const selected = labels.filter((l) => value.includes(l.id));
  return (
    <LabelPicker projectId={projectId} labels={labels} value={value} onChange={onChange} canCreate={canCreate} onCreated={onCreated} disabled={!canEdit}>
      {selected.length ? <LabelList labels={selected} /> : <span className="placeholder row" style={{ gap: 6 }}><Tag width={15} height={15} aria-hidden />{canEdit ? 'Add labels' : 'No labels'}</span>}
    </LabelPicker>
  );
}
