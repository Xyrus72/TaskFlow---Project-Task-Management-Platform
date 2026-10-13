import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { api } from '../api';
import { useAuth, toast } from '../store';
import { useDocumentTitle } from '../hooks';
import { Avatar, Button, Field, Logo } from '../components';
import { MiniBoard } from './Landing';

const DEMO = [
  { email: 'admin@taskflow.dev', name: 'Ava Admin', role: 'Admin, sees everything' },
  { email: 'maya@taskflow.dev', name: 'Maya Manager', role: 'Owns two projects' },
  { email: 'leo@taskflow.dev', name: 'Leo Developer', role: 'Manager on Mobile App' },
  { email: 'zara@taskflow.dev', name: 'Zara Designer', role: 'Member on 3 projects' },
  { email: 'victor@taskflow.dev', name: 'Victor Viewer', role: 'Viewer, read-only' },
  { email: 'noah@taskflow.dev', name: 'Noah Tester', role: 'Member, QA' },
];

export default function AuthPage({ mode = 'login' }) {
  const isLogin = mode === 'login';
  useDocumentTitle(isLogin ? 'Sign in' : 'Create your account');
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = location.state?.from || '/';

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); setFormError(''); };

  const signIn = async (body, path = '/auth/login') => {
    setBusy(true);
    setFormError('');
    try {
      const session = await api(path, { method: 'POST', body });
      setSession(session);
      toast(isLogin || path === '/auth/login' ? `Welcome back, ${session.user.name.split(' ')[0]}` : `Welcome to TaskFlow, ${session.user.name.split(' ')[0]}`);
      navigate(from, { replace: true });
    } catch (e) {
      if (e.details) setErrors(e.fields);
      else setFormError(e.message);
    } finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!isLogin && form.name.trim().length < 2) errs.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (isLogin ? !form.password : form.password.length < 6) errs.password = isLogin ? 'Enter your password' : 'Use at least 6 characters';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    signIn(isLogin ? { email: form.email, password: form.password } : form, isLogin ? '/auth/login' : '/auth/register');
  };

  return (
    <div className="auth">
      <main className="auth-main">
        <Logo />
        <div className="auth-form">
          <h1>{isLogin ? 'Sign in to TaskFlow' : 'Create your account'}</h1>
          <p className="sub">{isLogin ? 'Welcome back. Pick up where your team left off.' : 'Set up your workspace in under a minute.'}</p>
          <form onSubmit={submit} noValidate>
            {formError && <div className="alert alert-error" role="alert"><AlertTriangle aria-hidden />{formError}</div>}
            {!isLogin && (
              <Field label="Full name" error={errors.name} htmlFor="au-name">
                <input id="au-name" className={`input ${errors.name ? 'invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" placeholder="Alex Morgan" autoFocus />
              </Field>
            )}
            <Field label="Email" error={errors.email} htmlFor="au-email">
              <input id="au-email" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" autoFocus={isLogin} />
            </Field>
            <Field label="Password" error={errors.password} hint={isLogin ? undefined : 'At least 6 characters'} htmlFor="au-pass">
              <input id="au-pass" type="password" className={`input ${errors.password ? 'invalid' : ''}`} value={form.password} onChange={set('password')} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="••••••••" />
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={busy}>{isLogin ? 'Sign in' : 'Create account'}</Button>
          </form>
          <p className="auth-switch">
            {isLogin ? <>New to TaskFlow? <Link className="link" to="/register" state={location.state}>Create an account</Link></> : <>Already have an account? <Link className="link" to="/login" state={location.state}>Sign in</Link></>}
          </p>
          {isLogin && (
            <div className="demo-box">
              <div className="demo-title">Or try a demo account (password: password123)</div>
              <div className="demo-list">
                {DEMO.map((d) => (
                  <button key={d.email} type="button" className="demo-user" disabled={busy} onClick={() => signIn({ email: d.email, password: 'password123' })}>
                    <Avatar name={d.name} size="md" />
                    <span style={{ minWidth: 0 }}><span className="du-name truncate" style={{ display: 'block' }}>{d.name}</span><span className="du-role truncate" style={{ display: 'block' }}>{d.role}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs faint">© {new Date().getFullYear()} TaskFlow</p>
      </main>
      <aside className="auth-aside" aria-hidden>
        <h2>Your team’s work, in one place</h2>
        <p>Plan projects on a shared board, give everyone the right access, and see what needs attention today.</p>
        <ul>
          <li><Check />A Kanban board for every project</li>
          <li><Check />Roles that control who can change what</li>
          <li><Check />Updates from your team appear instantly</li>
        </ul>
        <div className="auth-preview"><MiniBoard /></div>
      </aside>
    </div>
  );
}
