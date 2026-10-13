import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme';
import { api } from '../api';
import { useAuth, toast } from '../store';
import { useDocumentTitle } from '../hooks';
import { Avatar, Button, Field, RoleBadge } from '../components';
import { fmtDateTime } from '../utils';

function ProfileForm() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Your name needs at least 2 characters'); return; }
    setBusy(true);
    try { const { user: u } = await api('/auth/me', { method: 'PATCH', body: { name } }); setUser(u); toast('Profile updated'); }
    catch (err) { setError(err.fields?.name || err.message); } finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={save} noValidate>
      <div className="card-header"><div><h2>Profile</h2><p>How you appear to your team</p></div></div>
      <div className="card-body stack">
        <div className="row" style={{ gap: 16 }}>
          <Avatar name={name.trim() || user.name} size="xl" />
          <div>
            <div className="strong" style={{ fontSize: 16 }}>{name.trim() || user.name}</div>
            <div className="row" style={{ marginTop: 4 }}><RoleBadge role={user.role} /><span className="text-sm muted">Joined {user.created_at ? fmtDateTime(user.created_at).split(',').slice(0, 2).join(',') : ''}</span></div>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Full name" error={error} htmlFor="pf-name">
            <input id="pf-name" className={`input ${error ? 'invalid' : ''}`} value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setError(''); }} autoComplete="name" />
          </Field>
          <Field label="Email" hint="Your email is your sign-in and can't be changed here." htmlFor="pf-email">
            <input id="pf-email" className="input" value={user.email} disabled />
          </Field>
        </div>
      </div>
      <div className="card-footer form-actions"><Button type="submit" variant="primary" loading={busy} disabled={name === user.name}>Save profile</Button></div>
    </form>
  );
}

function PasswordForm() {
  const empty = { currentPassword: '', newPassword: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); };
  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.currentPassword) errs.currentPassword = 'Enter your current password';
    if (form.newPassword.length < 6) errs.newPassword = 'Use at least 6 characters';
    if (form.confirm !== form.newPassword) errs.confirm = "The passwords don't match";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setForm(empty);
      toast('Password changed');
    } catch (err) { if (err.details) setErrors(err.fields); else toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={save} noValidate>
      <div className="card-header"><div><h2>Password</h2><p>Use at least 6 characters</p></div></div>
      <div className="card-body stack">
        <Field label="Current password" error={errors.currentPassword} htmlFor="pw-cur">
          <input id="pw-cur" type="password" className={`input ${errors.currentPassword ? 'invalid' : ''}`} value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
        </Field>
        <div className="form-grid">
          <Field label="New password" error={errors.newPassword} htmlFor="pw-new">
            <input id="pw-new" type="password" className={`input ${errors.newPassword ? 'invalid' : ''}`} value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={errors.confirm} htmlFor="pw-confirm">
            <input id="pw-confirm" type="password" className={`input ${errors.confirm ? 'invalid' : ''}`} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </Field>
        </div>
      </div>
      <div className="card-footer form-actions"><Button type="submit" variant="primary" loading={busy}>Change password</Button></div>
    </form>
  );
}

const THEMES = [
  { key: 'light', label: 'Light', icon: Sun, hint: 'White and blue. The default.' },
  { key: 'dark', label: 'Dark', icon: Moon, hint: 'Easier on the eyes at night.' },
  { key: 'system', label: 'System', icon: Monitor, hint: 'Follows your device setting.' },
];

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="card">
      <div className="card-header"><div><h2>Appearance</h2><p>Saved on this device</p></div></div>
      <div className="card-body">
        <div className="theme-options" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ key, label, icon: Icon, hint }) => (
            <button key={key} type="button" role="radio" aria-checked={theme === key} className={`theme-option ${theme === key ? 'on' : ''}`} onClick={() => setTheme(key)}>
              {key === 'system' ? (
                <span className="theme-preview system" aria-hidden>
                  <span className="theme-preview light"><i /><i /><i /></span>
                  <span className="theme-preview dark"><i /><i /><i /></span>
                </span>
              ) : <span className={`theme-preview ${key}`} aria-hidden><i /><i /><i /></span>}
              <span className="row" style={{ gap: 6 }}><Icon aria-hidden />{label}</span>
              <span className="hint">{hint}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Profile() {
  useDocumentTitle('Profile');
  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="page-header"><div><h1>Profile and settings</h1><p className="page-desc">Manage your name, sign-in details and how TaskFlow looks.</p></div></div>
      <div className="stack" style={{ gap: 20 }}>
        <ProfileForm />
        <AppearanceCard />
        <PasswordForm />
      </div>
    </div>
  );
}
