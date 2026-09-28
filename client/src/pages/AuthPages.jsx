import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Field from '../components/Field.jsx';
import { Banner } from '../components/States.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { EMAIL_RE, validateSignup } from '../lib/validation.js';

// Only allow same-site relative redirects after login.
function safeNext(params) {
  const next = params.get('next') || '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function useAuthForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const errors = validate(values);
  return {
    values,
    errors,
    busy,
    setBusy,
    serverError,
    setServerError,
    field: (key) => ({
      value: values[key],
      onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
      onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
      error: touched[key] ? errors[key] : undefined,
    }),
    touchAll: () => setTouched(Object.fromEntries(Object.keys(initial).map((k) => [k, true]))),
  };
}

export function Login() {
  useDocumentTitle('Sign in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params);
  const form = useAuthForm({ email: '', password: '' }, (v) => ({
    ...(EMAIL_RE.test(v.email.trim()) ? {} : { email: 'Enter a valid email address' }),
    ...(v.password ? {} : { password: 'Enter your password' }),
  }));

  if (user) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    form.touchAll();
    if (Object.keys(form.errors).length) return;
    form.setBusy(true);
    form.setServerError(null);
    try {
      await login({ email: form.values.email.trim(), password: form.values.password });
      navigate(next, { replace: true });
    } catch (err) {
      form.setServerError(err.message);
      form.setBusy(false);
    }
  }

  return (
    <main id="main" className="container page auth-page">
      <div className="card auth-card">
        <h1>Welcome back</h1>
        <p className="muted">Sign in to book and see your trips.</p>
        {form.serverError && (
          <Banner tone="error">
            <p>{form.serverError}</p>
          </Banner>
        )}
        <form onSubmit={submit} noValidate className="stack">
          <Field label="Email" type="email" autoComplete="email" {...form.field('email')} />
          <Field label="Password" type="password" autoComplete="current-password" {...form.field('password')} />
          <button type="submit" className="btn btn-primary btn-block" disabled={form.busy}>
            {form.busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="small">
          New to Atlas? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </p>
      </div>
    </main>
  );
}

export function Signup() {
  useDocumentTitle('Create an account');
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params);
  const form = useAuthForm({ name: '', email: '', password: '', phone: '' }, validateSignup);

  if (user) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    form.touchAll();
    if (Object.keys(form.errors).length) return;
    form.setBusy(true);
    form.setServerError(null);
    try {
      const { name, email, password, phone } = form.values;
      await register({ name: name.trim(), email: email.trim(), password, phone: phone.trim() });
      navigate(next, { replace: true });
    } catch (err) {
      form.setServerError(err.message);
      form.setBusy(false);
    }
  }

  return (
    <main id="main" className="container page auth-page">
      <div className="card auth-card">
        <h1>Create your account</h1>
        <p className="muted">Keep every booking in one calm place.</p>
        {form.serverError && (
          <Banner tone="error">
            <p>{form.serverError}</p>
          </Banner>
        )}
        <form onSubmit={submit} noValidate className="stack">
          <Field label="Full name" autoComplete="name" {...form.field('name')} />
          <Field label="Email" type="email" autoComplete="email" {...form.field('email')} />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            {...form.field('password')}
          />
          <Field label="Mobile number" optional type="tel" inputMode="numeric" autoComplete="tel-national" {...form.field('phone')} />
          <button type="submit" className="btn btn-primary btn-block" disabled={form.busy}>
            {form.busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="small">
          Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}
