import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

/* ---------- Auth (persisted to localStorage) ---------- */
export const useAuth = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'taskflow-auth' },
  ),
);

/* ---------- UI: toasts, confirm dialog, command palette, global "new" dialogs ---------- */
export const useUI = create((set, get) => ({
  toasts: [],
  confirmState: null,
  paletteOpen: false,
  newTask: null, // { projectId?, status? }
  newProject: null, // { teamId? }

  toast(message, type = 'success', action) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { id, message, type, action }] });
    setTimeout(() => get().dismiss(id), action ? 6000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  confirm: (opts) => new Promise((resolve) => set({ confirmState: { ...opts, resolve } })),
  closeConfirm(result) {
    get().confirmState?.resolve(result);
    set({ confirmState: null });
  },

  setPalette: (paletteOpen) => set({ paletteOpen }),
  openNewTask: (opts = {}) => set({ newTask: opts }),
  closeNewTask: () => set({ newTask: null }),
  openNewProject: (opts = {}) => set({ newProject: opts }),
  closeNewProject: () => set({ newProject: null }),
}));

export const toast = (message, type, action) => useUI.getState().toast(message, type, action);
export const confirmDialog = (opts) => useUI.getState().confirm(opts);

/* ---------- Realtime connection state ---------- */
export const useLive = create((set) => ({ connected: false, setConnected: (connected) => set({ connected }) }));

/* ---------- Board: tasks of the open project, shared filters, optimistic Kanban moves ---------- */
const emptyFilters = { search: '', priority: '', assigneeId: '', labelId: '' };

export const useBoard = create((set, get) => ({
  projectId: null,
  tasks: [],
  loading: false,
  error: null,
  filters: { ...emptyFilters },
  sort: 'position',

  open(projectId) {
    if (get().projectId === projectId) return get().load();
    set({ projectId, tasks: [], filters: { ...emptyFilters }, sort: 'position', error: null });
    return get().load();
  },

  async load({ silent = false } = {}) {
    const { projectId, filters, sort } = get();
    if (!projectId) return;
    if (!silent) set({ loading: true });
    try {
      const order = sort === 'priority' || sort === 'created_at' ? 'desc' : 'asc';
      const { data } = await api(`/projects/${projectId}/tasks`, { params: { ...filters, sort, order, limit: 500 } });
      if (get().projectId === projectId) set({ tasks: data, loading: false, error: null });
    } catch (e) {
      if (get().projectId === projectId) set({ loading: false, error: e });
    }
  },

  setFilter(key, value) {
    set({ filters: { ...get().filters, [key]: value } });
    return get().load({ silent: true });
  },
  resetFilters() {
    set({ filters: { ...emptyFilters } });
    return get().load({ silent: true });
  },
  setSort(sort) {
    set({ sort });
    return get().load({ silent: true });
  },

  /** Insert or replace a task coming from elsewhere (drawer edits, creation). */
  upsert(task) {
    if (task.project_id !== get().projectId) return;
    const exists = get().tasks.some((t) => t.id === task.id);
    set({ tasks: exists ? get().tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)) : [...get().tasks, task] });
  },
  removeLocal: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),

  async create(payload) {
    const task = await api(`/projects/${get().projectId}/tasks`, { method: 'POST', body: payload });
    get().upsert(task);
    return task;
  },

  /** Optimistic move between / within columns, rolled back if the server rejects it. */
  async move(id, status, position) {
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, status, position } : t)) });
    try {
      const task = await api(`/tasks/${id}`, { method: 'PATCH', body: { status, position } });
      get().upsert(task);
    } catch (e) {
      set({ tasks: prev });
      toast(e.message, 'error');
    }
  },
}));

/* ---------- Notifications (assigned, comments, mentions, added to a project) ---------- */
export const useNotifications = create((set, get) => ({
  items: [],
  unread: 0,
  page: 1,
  hasMore: false,
  loaded: false,

  /** Reload the first page. Returns the newest item if it is new since the last load. */
  async refresh() {
    const { loaded: wasLoaded, items } = get();
    const r = await api('/notifications', { params: { limit: 20 } });
    set({ items: r.data, unread: r.unread_count, page: 1, hasMore: r.pagination.pages > 1, loaded: true });
    const top = r.data[0];
    return wasLoaded && top && !top.read && top.id !== items[0]?.id ? top : null;
  },
  async loadMore() {
    const page = get().page + 1;
    const r = await api('/notifications', { params: { limit: 20, page } });
    set({ items: [...get().items, ...r.data], page, hasMore: r.pagination.pages > page, unread: r.unread_count });
  },
  async markRead(id, read = true) {
    const prev = get();
    set({ items: prev.items.map((n) => (n.id === id ? { ...n, read } : n)), unread: Math.max(0, prev.unread + (read ? -1 : 1)) });
    try { const r = await api(`/notifications/${id}`, { method: 'PATCH', body: { read } }); set({ unread: r.unread_count }); } catch { set(prev); }
  },
  async markAllRead() {
    const prev = get();
    set({ items: prev.items.map((n) => ({ ...n, read: true })), unread: 0 });
    try { await api('/notifications/read-all', { method: 'POST' }); } catch { set(prev); }
  },
  reset: () => set({ items: [], unread: 0, page: 1, hasMore: false, loaded: false }),
}));
