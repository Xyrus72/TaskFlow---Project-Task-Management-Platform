import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useNotifications } from './store';

/**
 * Load JSON from the API. Re-fetches when `path`/`params` change.
 * `reload({ silent: true })` refreshes without flipping back to the loading state (used for live updates).
 */
export function useFetch(path, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!enabled });
  const key = path ? `${path}?${JSON.stringify(params ?? {})}` : null;
  const req = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!path || !enabled) return;
    const id = ++req.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { params: paramsRef.current });
      if (id === req.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === req.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Subscribe to realtime change events (dispatched by the SSE connection in the app shell), debounced. */
export function useLiveEvents(handler, { filter, delay = 300 } = {}) {
  const ref = useRef(handler);
  const filterRef = useRef(filter);
  ref.current = handler;
  filterRef.current = filter;
  useEffect(() => {
    let timer;
    let last;
    const onChange = (e) => {
      if (filterRef.current && !filterRef.current(e.detail)) return;
      last = e.detail;
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(last), delay);
    };
    window.addEventListener('tf:change', onChange);
    return () => { clearTimeout(timer); window.removeEventListener('tf:change', onChange); };
  }, [delay]);
}

/** Global keyboard shortcut, e.g. useHotkey('mod+k', fn). */
export function useHotkey(combo, handler, { enabled = true } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    const [mod, key] = combo.includes('+') ? combo.split('+') : [null, combo];
    const onKey = (e) => {
      if (mod === 'mod' && !(e.metaKey || e.ctrlKey)) return;
      if (!mod && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (!mod && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key.toLowerCase() === key) { e.preventDefault(); ref.current(e); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}

/** Sets the browser tab title, prefixed with the unread notification count, e.g. "(3) Website relaunch · TaskFlow". */
export function useDocumentTitle(title) {
  const unread = useNotifications((s) => s.unread);
  useEffect(() => {
    const base = title ? `${title} · TaskFlow` : 'TaskFlow — Project and task management';
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
  }, [title, unread]);
}
