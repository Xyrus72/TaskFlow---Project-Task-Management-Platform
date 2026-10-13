import { Component, forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, Lock, UserRound, X,
} from 'lucide-react';
import { useUI } from './store';
import {
  avatarColors, dueInfo, initials, PRIORITY_LABEL, projectColor, ROLE_BADGE, STATUS_LABEL,
} from './utils';

/* ==========================================================================
   Primitives
   ========================================================================== */

export const Button = forwardRef(function Button(
  { variant = 'secondary', size, icon: Icon, iconRight: IconRight, loading, block, className = '', children, ...props }, ref,
) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', !children && 'btn-icon', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type="button" className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" aria-hidden /> : Icon && <Icon aria-hidden />}
      {children}
      {IconRight && <IconRight aria-hidden />}
    </button>
  );
});

export function Logo({ to = '/', compact }) {
  return (
    <Link to={to} className="logo" aria-label="TaskFlow home">
      <span className="logo-mark" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="4" height="14" rx="1.5" fill="#fff" /><rect x="10" y="5" width="4" height="10" rx="1.5" fill="#fff" opacity=".85" /><rect x="16" y="5" width="4" height="6" rx="1.5" fill="#fff" opacity=".7" /></svg>
      </span>
      {!compact && 'TaskFlow'}
    </Link>
  );
}

export function Avatar({ name, size = 'md', title }) {
  if (!name) {
    return <span className={`avatar avatar-empty avatar-${size}`} title={title || 'Unassigned'}><UserRound aria-hidden /></span>;
  }
  const [bg, fg] = avatarColors(name);
  return <span className={`avatar avatar-${size}`} style={{ '--av-bg': bg, '--av-fg': fg }} title={title || name}>{initials(name)}</span>;
}

export function AvatarStack({ users = [], total, max = 4, size = 'sm' }) {
  const shown = users.slice(0, max);
  const extra = (total ?? users.length) - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((u) => <Avatar key={u.id} name={u.name} size={size} />)}
      {extra > 0 && <span className={`avatar avatar-${size} avatar-more`} title={`${extra} more`}>+{extra}</span>}
    </span>
  );
}

export const Badge = ({ tone, children, className = '' }) => <span className={`badge ${tone ? `badge-${tone}` : ''} ${className}`}>{children}</span>;

export function RoleBadge({ role }) {
  if (!role) return null;
  return <span className={`badge ${ROLE_BADGE[role] || ''}`} style={{ textTransform: 'capitalize' }}>{role}</span>;
}

/** Linear-style status glyph: empty, half, three-quarter, check. */
export function StatusIcon({ status, size = 16 }) {
  const r = 6.25;
  const c = 2 * Math.PI * 3.1;
  const fill = { todo: 0, in_progress: 0.5, review: 0.75 }[status];
  return (
    <svg className={`status-icon c-${status}`} width={size} height={size} viewBox="0 0 16 16" aria-label={STATUS_LABEL[status]} role="img">
      {status === 'done' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2l2 2 4-4.2" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={status === 'todo' ? '2.6 1.8' : undefined} />
          {fill > 0 && (
            <circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" strokeWidth="6.2"
              strokeDasharray={`${c * fill} ${c}`} transform="rotate(-90 8 8)" />
          )}
        </>
      )}
    </svg>
  );
}

export const StatusPill = ({ status }) => (
  <span className={`status-pill s-${status}`}><StatusIcon status={status} size={14} />{STATUS_LABEL[status]}</span>
);

/** Signal-bar priority glyph; urgent gets an exclamation square. */
export function PriorityIcon({ priority, size = 16 }) {
  if (priority === 'urgent') {
    return (
      <svg className="prio-icon p-urgent" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="Urgent">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="currentColor" />
        <path d="M8 4.6v4.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="11.3" r="1.05" fill="#fff" />
      </svg>
    );
  }
  const level = { low: 1, medium: 2, high: 3 }[priority] || 0;
  return (
    <svg className={`prio-icon p-${priority}`} width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={PRIORITY_LABEL[priority]}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={11 - i * 3.5} width="3" height={3.5 + i * 3.5} rx="1"
          fill="currentColor" opacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  );
}

export const PriorityLabel = ({ priority }) => (
  <span className="prio"><PriorityIcon priority={priority} />{PRIORITY_LABEL[priority]}</span>
);

export function DueBadge({ date, status, chip = true, showIcon = true }) {
  const d = dueInfo(date, status);
  if (!d) return null;
  const state = d.state === 'overdue' ? 'due-overdue' : d.state === 'today' ? 'due-today' : '';
  return (
    <span className={`due ${chip ? 'due-chip' : ''} ${state}`} title={d.state === 'overdue' ? 'Overdue' : 'Due date'}>
      {showIcon && <CalendarClock aria-hidden />}{d.label}
    </span>
  );
}

export function ProjectChip({ id, name }) {
  return <span className="project-chip"><span className="project-dot" style={{ background: projectColor(id) }} /> <span className="truncate">{name}</span></span>;
}

export function ProjectIcon({ id, name, size = 40 }) {
  const color = projectColor(id);
  return (
    <span className="project-icon" style={{ width: size, height: size, background: `${color}14`, color, fontSize: size * 0.4, borderRadius: size / 4 }}>
      {(name || '?')[0].toUpperCase()}
    </span>
  );
}

export function Field({ label, hint, error, optional, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label className="label" htmlFor={htmlFor}>{label} {optional && <span className="optional">(optional)</span>}</label>}
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export const Spinner = ({ size = 18 }) => <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
export const LoadingBlock = () => <div className="loading-block"><Spinner size={24} /></div>;
export const Skeleton = ({ w = '100%', h = 14, r = 6, style }) => <span className="skeleton" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;

export function EmptyState({ icon: Icon = Info, title, children, action, small }) {
  return (
    <div className={`empty ${small ? 'empty-sm' : ''}`}>
      <div className="empty-icon"><Icon aria-hidden /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/**
 * Catches render errors (and failed page downloads) so one broken page doesn't blank the whole app.
 * Changing `resetKey` (the URL) clears the error.
 */
export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info.componentStack); } // eslint-disable-line no-console
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card">
          <EmptyState icon={AlertTriangle} title="This page couldn't be shown"
            action={<Button variant="primary" onClick={() => window.location.reload()}>Reload the page</Button>}>
            Your work is saved on the server. Reloading usually fixes this.
          </EmptyState>
        </div>
      </div>
    );
  }
}

export function ErrorState({ error, onRetry }) {
  const s = error?.status;
  const [title, body] = s === 403
    ? [error.message || "You don't have access to this", 'Ask a project manager or team lead to add you.']
    : s === 404
      ? ["We couldn't find that", 'It may have been deleted, or the link may be wrong.']
      : ["Couldn't load this", error?.message];
  return (
    <EmptyState icon={s === 403 ? Lock : AlertTriangle} title={title}
      action={onRetry && s !== 403 && s !== 404 && <Button onClick={() => onRetry()}>Try again</Button>}>
      {body}
    </EmptyState>
  );
}

export function Pagination({ page, pages, total, limit, onPage, noun = 'results' }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const nums = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="nums">Showing {from}–{to} of {total} {noun}</span>
      {pages > 1 && (
        <div className="pages">
          <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></button>
          {nums.map((n, i) => (n === '…'
            ? <span key={`e${i}`} className="faint" style={{ padding: '0 4px' }}>…</span>
            : <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>))}
          <button className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></button>
        </div>
      )}
    </nav>
  );
}

export function ProgressBar({ value, tone }) {
  return <div className={`progress ${tone || ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => {
        const Icon = t.icon;
        const inner = <>{Icon && <Icon aria-hidden />}{t.label}{t.count != null && <span className="count">{t.count}</span>}{t.unread > 0 && <span className="count unread" aria-label={`${t.unread} unread`}>{t.unread > 99 ? '99+' : t.unread}</span>}</>;
        return t.to ? (
          <Link key={t.key} to={t.to} role="tab" aria-selected={active === t.key} className={`tab ${active === t.key ? 'active' : ''}`}>{inner}</Link>
        ) : (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>{inner}</button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Overlays — a shared stack makes Escape close only the top-most layer.
   ========================================================================== */
const layers = [];
export function useLayer(open, onClose) {
  const id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    layers.push(id);
    const onKey = (e) => {
      if (e.key === 'Escape' && layers[layers.length - 1] === id) { e.stopPropagation(); close.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); layers.splice(layers.indexOf(id), 1); };
  }, [open, id]);
}

function useScrollLock(open) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
}

function useAutoFocus(open, ref) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)');
      (el || ref.current)?.focus?.();
    }, 30);
    return () => clearTimeout(t);
  }, [open, ref]);
}

export function Modal({ open, onClose, title, description, icon, iconTone = 'blue', size, footer, children, as = 'div', onSubmit }) {
  const ref = useRef(null);
  useLayer(open, onClose);
  useScrollLock(open);
  useAutoFocus(open, ref);
  if (!open) return null;
  const Body = as;
  const Icon = icon;
  return createPortal(
    <>
      <div className="overlay" />
      <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
        <Body ref={ref} className={`modal ${size ? `modal-${size}` : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
          onSubmit={onSubmit ? (e) => { e.preventDefault(); onSubmit(e); } : undefined} noValidate={as === 'form' ? true : undefined}>
          <div className="modal-header">
            <div>
              {Icon && <div className={`modal-icon ${iconTone}`}><Icon aria-hidden /></div>}
              <h2>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </Body>
      </div>
    </>,
    document.body,
  );
}

export function Drawer({ open, onClose, header, children, label }) {
  const ref = useRef(null);
  useLayer(open, onClose);
  useScrollLock(open);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 30); }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onMouseDown={onClose} />
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="drawer-header">{header}</div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

/** Floating panel anchored to an element; flips above when there is no room below. */
export function Popover({ anchorRef, open, onClose, align = 'start', minWidth, children, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayer(open, onClose);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const p = ref.current?.getBoundingClientRect();
      if (!a || !p) return;
      const below = window.innerHeight - a.bottom;
      const top = below < p.height + 12 && a.top > p.height + 12 ? a.top - p.height - 6 : a.bottom + 6;
      let left = align === 'end' ? a.right - p.width : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
      setPos({ top, left, minWidth: minWidth ?? a.width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchorRef, align, minWidth]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} className={`popover ${className}`} style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : { top: -9999, left: -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

/** Dropdown menu of actions. `trigger` receives props to spread onto a button. */
export function Menu({ trigger, items, align = 'end' }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const close = () => setOpen(false);
  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      <Popover anchorRef={anchor} open={open} onClose={close} align={align} minWidth={200}>
        <div role="menu">
          {items.filter(Boolean).map((it, i) => (it.divider
            ? <div key={`d${i}`} className="menu-sep" />
            : (
              <button key={it.label} type="button" role="menuitem" className={`menu-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled}
                onClick={() => { close(); it.onSelect(); }}>
                {it.icon && <it.icon aria-hidden />}{it.label}
              </button>
            )))}
        </div>
      </Popover>
    </>
  );
}

/**
 * Custom select with icons/avatars, keyboard navigation and optional search.
 * options: [{ value, label, icon?, hint? }]
 */
export function Picker({
  value, options, onChange, placeholder = 'Select', disabled, size, variant, searchable, label, className = '', align = 'start',
  highlightActive, renderValue,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const anchor = useRef(null);
  const listRef = useRef(null);
  const selected = options.find((o) => o.value === value);
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector('.menu-item.active')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const choose = (o) => { setOpen(false); anchor.current?.focus(); if (o.value !== value) onChange(o.value); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
    if (e.key === 'Tab') setOpen(false);
  };
  const isActiveFilter = highlightActive && value !== '' && value != null;

  return (
    <>
      <button ref={anchor} type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        className={`picker-trigger ${size || ''} ${variant || ''} ${isActiveFilter ? 'active-filter' : ''} ${className}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } else if (open) onKeyDown(e); }}>
        {renderValue ? renderValue(selected) : selected ? <>{selected.icon}<span className="truncate">{selected.label}</span></> : <span className="placeholder">{placeholder}</span>}
        {!disabled && <ChevronDown className="chev" aria-hidden />}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align={align}>
        {(searchable ?? options.length > 8) && (
          <div className="popover-search">
            <input className="input input-sm" autoFocus placeholder="Search…" value={query} aria-label="Search options"
              onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          </div>
        )}
        <div className="popover-list" role="listbox" ref={listRef} tabIndex={-1} onKeyDown={onKeyDown}>
          {filtered.length === 0 && <div className="menu-empty">No matches</div>}
          {filtered.map((o, i) => (
            <button key={String(o.value)} type="button" role="option" aria-selected={o.value === value}
              className={`menu-item ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
              {o.icon}<span className="grow truncate">{o.label}{o.hint && <span className="faint text-xs"> · {o.hint}</span>}</span>
              {o.value === value && <Check className="check" aria-hidden />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/* ==========================================================================
   Global hosts: toasts and the confirm dialog
   ========================================================================== */
export function ToastHost() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.type === 'error' ? AlertTriangle : t.type === 'info' ? Info : CheckCircle2;
        return (
          <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon aria-hidden />
            <span className="grow">{t.message}</span>
            {t.action && <button className="link" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => { dismiss(t.id); t.action.onClick(); }}>{t.action.label}</button>}
            <button className="btn btn-ghost btn-sm btn-icon close" style={{ '--btn-h': '24px' }} onClick={() => dismiss(t.id)} aria-label="Dismiss"><X /></button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmHost() {
  const { confirmState: c, closeConfirm } = useUI();
  return (
    <Modal open={!!c} onClose={() => closeConfirm(false)} size="sm" title={c?.title} icon={c?.danger ? AlertTriangle : Info} iconTone={c?.danger ? 'red' : 'blue'}
      footer={(
        <>
          <Button onClick={() => closeConfirm(false)}>Cancel</Button>
          <Button variant={c?.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} data-autofocus>{c?.confirmLabel || 'Confirm'}</Button>
        </>
      )}>
      <p className="muted">{c?.message}</p>
    </Modal>
  );
}
