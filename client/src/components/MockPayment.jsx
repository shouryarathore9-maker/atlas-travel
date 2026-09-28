import { useState } from 'react';
import Field from './Field.jsx';
import Icon from './Icon.jsx';
import { formatPrice } from '../lib/format.js';

// Pure UI simulation (architecture.md §6). Card details are validated for format only and are
// never sent anywhere — the parent only learns the method and whether to simulate a decline.

const FAIL_SUFFIX = '0002';

export function validateCard({ number, expiry, cvv, name }) {
  const errors = {};
  const digits = number.replace(/\s/g, '');
  if (!/^\d{16}$/.test(digits)) errors.number = 'Enter the 16-digit card number';
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) {
    errors.expiry = 'Use MM/YY';
  } else {
    const now = new Date();
    const exp = new Date(2000 + Number(m[2]), Number(m[1])); // first day of the month after expiry
    if (exp <= now) errors.expiry = 'This card has expired';
  }
  if (!/^\d{3}$/.test(cvv)) errors.cvv = 'Enter the 3-digit CVV';
  if (name.trim().length < 2) errors.name = 'Enter the name on the card';
  return errors;
}

const formatCardNumber = (v) =>
  v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

const formatExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function FakeQr() {
  // Deterministic decorative pattern — not a scannable code.
  const cells = [];
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const on = finder
        ? !(x % 20 === 1 || y % 20 === 1 || x === 5 || y === 5 || x === 15 || y === 15) || (x % 14 >= 2 && x % 14 <= 4 && y % 14 >= 2 && y % 14 <= 4)
        : (x * 7 + y * 13 + x * y) % 5 < 2;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  return (
    <svg viewBox="-1 -1 23 23" width="168" height="168" className="fake-qr" role="img" aria-label="Sample QR code (simulation)">
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      <g fill="#17221F">{cells}</g>
    </svg>
  );
}

export default function MockPayment({ amount, busy, onPay }) {
  const [method, setMethod] = useState('upi');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' });
  const [touched, setTouched] = useState({});
  const errors = validateCard(card);
  const shown = (key) => (touched[key] ? errors[key] : undefined);
  const set = (key, fmt = (v) => v) => (e) => setCard((c) => ({ ...c, [key]: fmt(e.target.value) }));
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  function payByCard(e) {
    e.preventDefault();
    setTouched({ number: true, expiry: true, cvv: true, name: true });
    if (Object.keys(errors).length) return;
    const digits = card.number.replace(/\s/g, '');
    onPay({ method: 'card', simulateFailure: digits.endsWith(FAIL_SUFFIX) });
  }

  return (
    <section className="card" aria-labelledby="pay-heading">
      <h2 id="pay-heading">Payment</h2>
      <div className="tabs" role="tablist" aria-label="Payment method">
        {[
          { id: 'upi', label: 'UPI / QR', icon: 'qr' },
          { id: 'card', label: 'Card', icon: 'card' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`pay-tab-${t.id}`}
            aria-selected={method === t.id}
            aria-controls={`pay-panel-${t.id}`}
            className="tab"
            onClick={() => setMethod(t.id)}
          >
            <Icon name={t.icon} size={18} /> {t.label}
          </button>
        ))}
      </div>

      {method === 'upi' ? (
        <div role="tabpanel" id="pay-panel-upi" aria-labelledby="pay-tab-upi" className="pay-panel upi-panel">
          <FakeQr />
          <div className="stack">
            <p>
              Scan with any UPI app to pay <strong>{formatPrice(amount)}</strong>.
            </p>
            <p className="small muted">This is a simulation — no UPI request is sent and no money moves.</p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onPay({ method: 'upi', simulateFailure: false })}>
              Simulate payment
            </button>
            <button type="button" className="btn-text small" disabled={busy} onClick={() => onPay({ method: 'upi', simulateFailure: true })}>
              Simulate a failed payment
            </button>
          </div>
        </div>
      ) : (
        <form role="tabpanel" id="pay-panel-card" aria-labelledby="pay-tab-card" className="pay-panel" onSubmit={payByCard} noValidate>
          <div className="form-grid cols-2">
            <Field
              label="Card number"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4242 4242 4242 4242"
              value={card.number}
              onChange={set('number', formatCardNumber)}
              onBlur={blur('number')}
              error={shown('number')}
              hint={`Any 16 digits work. A number ending in ${FAIL_SUFFIX} simulates a decline.`}
              className="span-2"
            />
            <Field label="Expiry" inputMode="numeric" autoComplete="off" placeholder="MM/YY" value={card.expiry} onChange={set('expiry', formatExpiry)} onBlur={blur('expiry')} error={shown('expiry')} />
            <Field
              label="CVV"
              inputMode="numeric"
              autoComplete="off"
              type="password"
              maxLength={3}
              value={card.cvv}
              onChange={set('cvv', (v) => v.replace(/\D/g, '').slice(0, 3))}
              onBlur={blur('cvv')}
              error={shown('cvv')}
            />
            <Field label="Name on card" autoComplete="off" value={card.name} onChange={set('name')} onBlur={blur('name')} error={shown('name')} className="span-2" />
          </div>
          <p className="small muted">Card details stay in this browser tab — they are never sent to a server.</p>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Pay {formatPrice(amount)}
          </button>
        </form>
      )}
    </section>
  );
}
