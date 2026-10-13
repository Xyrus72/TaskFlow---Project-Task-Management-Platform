import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth, toast, confirmDialog } from '../store';
import { useDebounced, useDocumentTitle, useFetch } from '../hooks';
import { Avatar, EmptyState, ErrorState, Pagination, Picker, RoleBadge, Skeleton } from '../components';
import { fmtDate } from '../utils';

const ROLES = [{ value: 'admin', label: 'Admin' }, { value: 'member', label: 'Member' }];

/** Workspace user management (global RBAC): admins can see everyone and promote or demote admins. */
export default function AdminUsers() {
  useDocumentTitle('Users');
  const me = useAuth((s) => s.user);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 250);
  const { data, error, loading, reload, setData } = useFetch('/admin/users', { search: q, page, limit: 15 }, { enabled: me.role === 'admin' });
  useEffect(() => setPage(1), [q]);
  if (me.role !== 'admin') return <Navigate to="/" replace />;

  const setRole = async (u, role) => {
    if (role === 'admin') {
      const ok = await confirmDialog({ title: `Make ${u.name} an admin?`, message: 'Admins can open, edit and delete every project and team in the workspace.', confirmLabel: 'Make admin' });
      if (!ok) return;
    }
    try {
      const updated = await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role } });
      setData((d) => ({ ...d, data: d.data.map((x) => (x.id === u.id ? updated : x)) }));
      toast(`${u.name} is now ${role === 'admin' ? 'an admin' : 'a member'}`);
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-desc">Everyone with an account. Admins can open every project; members only see projects they belong to.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="input-icon">
          <Search aria-hidden />
          <input className="input input-sm" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
        </div>
      </div>
      <div className="card">
        {error && <ErrorState error={error} onRetry={reload} />}
        {data?.data.length === 0 && <EmptyState icon={Users} title="No users match">Try a different name or email.</EmptyState>}
        {(!data || data.data.length > 0) && !error && (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>User</th><th>Role</th><th>Teams</th><th>Projects</th><th>Open tasks</th><th>Joined</th></tr></thead>
                <tbody style={{ opacity: loading && data ? 0.6 : 1 }}>
                  {!data && [0, 1, 2, 3].map((i) => <tr key={i}>{[0, 1, 2, 3, 4, 5].map((j) => <td key={j}><Skeleton w={j ? '50%' : '70%'} /></td>)}</tr>)}
                  {data?.data.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <span className="row" style={{ gap: 12 }}>
                          <Avatar name={u.name} size="lg" />
                          <span><span className="strong" style={{ display: 'block' }}>{u.name}{u.id === me.id && <span className="faint" style={{ fontWeight: 400 }}> (you)</span>}</span><span className="text-sm muted">{u.email}</span></span>
                        </span>
                      </td>
                      <td>{u.id === me.id ? <RoleBadge role={u.role} /> : <Picker size="sm" value={u.role} options={ROLES} onChange={(r) => setRole(u, r)} label={`Role of ${u.name}`} />}</td>
                      <td className="nums">{u.team_count}</td>
                      <td className="nums">{u.project_count}</td>
                      <td className="nums">{u.open_tasks}</td>
                      <td className="muted text-sm">{fmtDate(u.created_at.slice(0, 10), { year: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onPage={setPage} noun="users" />}
          </>
        )}
      </div>
    </div>
  );
}
