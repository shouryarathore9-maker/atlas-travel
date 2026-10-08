import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SandboxDialog } from './Sandbox.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { SANDBOX_ENTRIES } from '../lib/sandbox.js';

export default function Footer() {
  const { sandbox, endSandbox } = useAuth();
  const navigate = useNavigate();
  const [trying, setTrying] = useState(null);
  return (
    <footer className="footer">
      <div className="container spread">
        <div>
          <Link to="/" className="logo">
            Atlas
          </Link>
          <p className="small" style={{ marginTop: 'var(--space-2)' }}>
            A learning project. All flights, hotels and payments are simulated.
          </p>
          <ul className="footer-demo" aria-label="Try the consoles">
            {SANDBOX_ENTRIES.map(([kind, label]) => (
              <li key={kind}>
                {sandbox?.kind === kind ? (
                  <button
                    type="button"
                    className="btn-text small"
                    onClick={async () => {
                      navigate('/');
                      await endSandbox();
                    }}
                  >
                    Back to traveller view
                  </button>
                ) : (
                  <button type="button" className="btn-text small" onClick={() => setTrying(kind)}>
                    {label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p className="small">© {new Date().getFullYear()} Atlas</p>
      </div>
      {trying && <SandboxDialog kind={trying} onClose={() => setTrying(null)} />}
    </footer>
  );
}
