import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Avatar } from './components';
import { mentionQuery, splitMentions } from './utils';

/** Comment text with "@Full Name" mentions of project members highlighted. */
export function MentionText({ text, members }) {
  return splitMentions(text, members).map((p, i) => (p.mention ? <span key={i} className="mention">{p.text}</span> : p.text));
}

/**
 * Textarea that suggests project members after "@". Picking one inserts "@Full Name ".
 * Arrow keys / Enter / Tab choose, Escape closes the list (without closing the surrounding dialog).
 */
export const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, members, onKeyDown, ...props }, ref) {
  const area = useRef(null);
  const [query, setQuery] = useState(null);
  const [active, setActive] = useState(0);
  useImperativeHandle(ref, () => area.current);

  const matches = query === null ? [] : members
    .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.toLowerCase().startsWith(query.toLowerCase()) ? -1 : b.name.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0)
    .slice(0, 6);

  const sync = (text, caret) => { setQuery(mentionQuery(text.slice(0, caret))); setActive(0); };
  const pick = (m) => {
    const el = area.current;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([^\s@]*(?: [^\s@]*)?)$/, `@${m.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  };

  return (
    <div className="mention-wrap">
      <textarea
        ref={area}
        value={value}
        onChange={(e) => { onChange(e.target.value); sync(e.target.value, e.target.selectionStart); }}
        onClick={(e) => sync(value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
            if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return; }
            if (e.key === 'Escape') { e.stopPropagation(); setQuery(null); return; }
          }
          onKeyDown?.(e);
        }}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
        {...props}
      />
      {matches.length > 0 && (
        <div className="mention-list" role="listbox" aria-label="Mention someone">
          {matches.map((m, i) => (
            <button key={m.id} type="button" role="option" aria-selected={i === active} className={`menu-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setActive(i)}>
              <Avatar name={m.name} size="xs" />{m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
