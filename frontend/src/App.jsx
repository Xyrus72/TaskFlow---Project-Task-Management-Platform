import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './store';
import { ConfirmHost, ErrorBoundary, LoadingBlock, ToastHost } from './components';
import AppShell from './Layout';

// Each page is downloaded the first time it is opened, so the first load stays small.
const Landing = lazy(() => import('./pages/Landing'));
const AuthPage = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectPage = lazy(() => import('./pages/ProjectBoard'));
const Teams = lazy(() => import('./pages/Teams'));
const TeamDetail = lazy(() => import('./pages/TeamDetail'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Re-validate a stored session once on load (the role or name may have changed). */
function useSessionRefresh() {
  const token = useAuth((s) => s.token);
  const setUser = useAuth((s) => s.setUser);
  useEffect(() => {
    if (token) api('/auth/me').then((r) => setUser(r.user)).catch(() => {});
  }, [token, setUser]);
}

export default function App() {
  const token = useAuth((s) => s.token);
  const location = useLocation();
  useSessionRefresh();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<LoadingBlock />}>
      <Routes>
        {!token ? (
          <>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="*" element={<Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />} />
          </>
        ) : (
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="my-tasks" element={<MyTasks />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id/:tab?" element={<ProjectPage />} />
            <Route path="teams" element={<Teams />} />
            <Route path="teams/:id" element={<TeamDetail />} />
            <Route path="settings/profile" element={<Profile />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="login" element={<Navigate to={location.state?.from || '/'} replace />} />
            <Route path="register" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        )}
      </Routes>
      </Suspense>
      <ToastHost />
      <ConfirmHost />
    </ErrorBoundary>
  );
}
