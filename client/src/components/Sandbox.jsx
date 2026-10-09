import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal.jsx';
import { sandboxApi } from '../api/resources.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { SANDBOX_ENTRIES } from '../lib/sandbox.js';

// The "Try as …" popup (prd.md → Visitor sandbox): pick an airline or one of the best hotels, read
// what a sandbox is, and start it.
export function SandboxDialog({ kind, onClose }) {
  const { startSandbox } = useAuth();
  const navigate = useNavigate();
  const [options, setOptions] = useState(null);
  const [choice, setChoice] = useState('');
  const [state, setState] = useState({ busy: false, error: null });

  useEffect(() => {
    if (kind === 'admin') return;
    sandboxApi
      .options()
      .then((o) => {
        setOptions(o);
        const list = kind === 'airline' ? o.airlines : o.hotels;
        setChoice(list[0] ? String(list[0].supplierId) : '');
      })
      .catch((e) => setState({ busy: false, error: e.message }));
  }, [kind]);

  async function start() {
    setState({ busy: true, error: null });
    try {
      await startSandbox({ kind, ...(kind !== 'admin' && { supplierId: choice }) });
      onClose();
      navigate(kind === 'admin' ? '/admin' : '/supplier');
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }

  const list = options ? (kind === 'airline' ? options.airlines : options.hotels) : [];
  const title = SANDBOX_ENTRIES.find(([k]) => k === kind)[1];
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={start} disabled={state.busy || (kind !== 'admin' && !choice)} aria-busy={state.busy || undefined}>
            {state.busy ? 'Setting up your demo…' : 'Start demo'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={state.busy}>
            Cancel
          </button>
        </div>
      }
    >
      <p>
        <strong>This is a simulation.</strong> Anything you change here stays in your private demo and never appears on the real website.
      </p>
      <p className="small muted">
        Your demo is deleted when you choose Back to traveller view, after 30 minutes without activity, or 2 hours after it starts. Please don’t enter real personal details.
      </p>
      {kind !== 'admin' && (
        <fieldset className="field sandbox-choice">
          <legend>{kind === 'airline' ? 'Which airline?' : 'Which hotel?'}</legend>
          {!options && !state.error && <p className="small muted">Loading…</p>}
          {list.map((o) => (
            <label key={o.supplierId} className="radio-row">
              <input type="radio" name="sandbox-choice" value={o.supplierId} checked={choice === String(o.supplierId)} onChange={() => setChoice(String(o.supplierId))} />
              {o.name}
              {o.city && <span className="small muted"> · {o.city}</span>}
              {o.code && <span className="small muted"> · {o.code}</span>}
            </label>
          ))}
        </fieldset>
      )}
      {kind === 'admin' && <p className="small">You’ll get the admin console with a small copy of the platform: one airline, one hotel, their bookings, statements and tickets.</p>}
      {options && !options.enabled && <p className="field-error">The demo is switched off right now.</p>}
      {state.error && <p className="field-error">{state.error}</p>}
    </Modal>
  );
}

// Shown on every page while a sandbox is active.
export function SandboxBanner() {
  const { sandbox, sandboxEnded, dismissSandboxEnded, endSandbox, switchSandboxView } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (sandboxEnded && !sandbox) {
    return (
      <div className="sandbox-banner" role="status">
        <div className="container sandbox-banner-inner">
          <p>Your demo has ended and everything in it was deleted.</p>
          <button type="button" className="btn-text" onClick={dismissSandboxEnded}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  if (!sandbox) return null;

  // Going to a public page: leave first (a console page would bounce the new account to sign-in).
  // Going to the console: switch account first, so the console accepts it.
  const act = async (fn, to, { leaveFirst = true } = {}) => {
    setBusy(true);
    if (leaveFirst) navigate(to);
    try {
      await fn();
      if (!leaveFirst) navigate(to);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sandbox-banner" role="status">
      <div className="container sandbox-banner-inner">
        <p>
          <strong>Demo environment.</strong> Data resets automatically. Don’t enter real personal details.
        </p>
        <div className="row">
          {sandbox.kind !== 'admin' &&
            (sandbox.role === 'traveller' ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(switchSandboxView, '/supplier', { leaveFirst: false })}>
                Back to the console
              </button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(switchSandboxView, '/')}>
                View as a traveller
              </button>
            ))}
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(endSandbox, '/')}>
            Back to traveller view
          </button>
        </div>
      </div>
    </div>
  );
}
