import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { Banner, ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDateTime, formatPrice } from '../../lib/format.js';

const toLocalInput = (date) => new Date(new Date(date).getTime() + 5.5 * 3600e3).toISOString().slice(0, 16);

function Seats({ label, cabin }) {
  if (!cabin) return null;
  const pct = cabin.capacity ? Math.round((cabin.sold / cabin.capacity) * 100) : 0;
  return (
    <div className="load-bar">
      <p className="small">
        {label}: {cabin.sold} of {cabin.capacity} seats sold ({pct}%)
      </p>
      <div className="load-track" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// One departure: its seats sold, passenger list and the airline's actions (prd.md → Workflows 6, 7, 33).
export default function DepartureDetail() {
  const { id } = useParams();
  const { data, error, reload } = useAsync((signal) => supplierApi.departures.get(id, { signal }), [id]);
  const [dialog, setDialog] = useState(null); // 'cancel' | 'reschedule'
  const [form, setForm] = useState({ reason: '', time: '' });
  const [action, setAction] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);
  useDocumentTitle(data ? `${data.flight.flightNumber} · ${data.flight.date}` : 'Departure');

  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Departure not found' : undefined} />;
  if (!data) return <Spinner />;
  const { flight, bookings, affected } = data;
  const departed = new Date(flight.departureTime) <= new Date();
  const editable = flight.status !== 'cancelled' && !departed;

  async function run(fn, done) {
    setAction({ busy: true, error: null });
    try {
      const res = await fn();
      setNotice(done(res));
      setDialog(null);
      setAction({ busy: false, error: null });
      reload();
    } catch (err) {
      setAction({ busy: false, error: err.message });
    }
  }

  const open = (which) => {
    setForm({ reason: '', time: toLocalInput(flight.departureTime) });
    setAction({ busy: false, error: null });
    setDialog(which);
  };

  return (
    <>
      <Link to="/supplier/departures" className="btn-text back-link">
        ← All departures
      </Link>
      <div className="spread departure-head">
        <div>
          <h1 className="console-h1">
            {flight.flightNumber} · {flight.origin.code} → {flight.destination.code}
          </h1>
          <p className="muted">
            {formatDateTime(flight.departureTime)} · {flight.aircraftName}
          </p>
          {flight.scheduleChange && <p className="small">Rescheduled from {formatDateTime(flight.scheduleChange.previousDeparture)}</p>}
        </div>
        <span className={`badge ${flight.status === 'cancelled' ? 'badge-error' : flight.salesStopped ? 'badge-olive' : 'badge-success'}`}>
          {flight.status === 'cancelled' ? 'Cancelled' : flight.salesStopped ? 'Sales stopped' : 'On sale'}
        </span>
      </div>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      {flight.cancellationJob?.state === 'pending' && (
        <Banner tone="info">
          <p>Refunds are still being processed ({flight.cancellationJob.processed} so far). They’ll finish automatically.</p>
        </Banner>
      )}

      <section className="card">
        <Seats label="Economy" cabin={flight.cabins.economy} />
        <Seats label="Business" cabin={flight.cabins.business} />
        {editable && (
          <div className="row departure-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                run(
                  () => (flight.salesStopped ? supplierApi.departures.resumeSales(id) : supplierApi.departures.stopSales(id)),
                  () => (flight.salesStopped ? 'Sales resumed.' : 'Sales stopped — it no longer appears in search.'),
                )
              }
            >
              {flight.salesStopped ? 'Resume sales' : 'Stop sales'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => open('reschedule')}>
              Reschedule
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => open('cancel')}>
              Cancel departure
            </button>
          </div>
        )}
      </section>

      <section className="console-section">
        <h2 className="h3">Passengers</h2>
        {bookings.length === 0 ? (
          <p className="muted">No bookings yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table passenger-table">
              <thead>
                <tr>
                  <th scope="col">Booking</th>
                  <th scope="col">Passengers</th>
                  <th scope="col">Seat · meal</th>
                  <th scope="col">Special request</th>
                  <th scope="col">Offer</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b._id}>
                    <td>
                      {b.bookingReference}
                      <br />
                      <span className="small muted">PNR {b.pnr}</span>
                    </td>
                    <td>
                      {b.travellers.map((t, i) => (
                        <span key={i} className="block">
                          {t.name} <span className="small muted">({t.ageCategory})</span>
                        </span>
                      ))}
                    </td>
                    <td>
                      {b.travellers.map((t, i) => (
                        <span key={i} className="block small">
                          {t.ageCategory === 'infant' ? 'lap' : t.seat || '—'} · {t.meal || 'no meal'}
                        </span>
                      ))}
                    </td>
                    <td className="small">
                      {b.specialRequest ? (
                        <>
                          {b.specialRequest.text}
                          <span className="block muted">{b.specialRequest.reply ? `Replied: ${b.specialRequest.reply.status}` : 'Not answered yet'}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="small">{b.offer ? `${b.offer.code || b.offer.title} −${formatPrice(b.offer.amount)} (${b.offer.funder === 'platform' ? 'Atlas-funded' : 'your offer'})` : '—'}</td>
                    <td>{formatPrice(b.total)}</td>
                    <td>
                      {b.status === 'cancelled' ? `Cancelled by ${b.cancellation?.by === 'supplier' ? 'you' : 'traveller'}` : b.reschedule?.decision === 'pending' ? 'Deciding on new time' : 'Confirmed'}
                      {b.checkedIn && <span className="block small muted">Checked in</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog === 'cancel' && (
        <Modal
          title="Cancel this departure?"
          onClose={() => setDialog(null)}
          footer={
            <div className="row">
              <button
                type="button"
                className="btn btn-danger"
                disabled={action.busy}
                aria-busy={action.busy || undefined}
                onClick={() => run(() => supplierApi.departures.cancel(id, form.reason.trim()), (r) => `Departure cancelled. ${r.bookingsRefunded} booking${r.bookingsRefunded === 1 ? '' : 's'} refunded in full.`)}
              >
                {action.busy ? 'Cancelling…' : 'Cancel departure and refund'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Keep it
              </button>
            </div>
          }
        >
          <p>
            <strong>{affected.bookings}</strong> booking{affected.bookings === 1 ? '' : 's'} will be refunded <strong>{formatPrice(affected.refunds)}</strong> in full. Travellers are told
            straight away with a receipt and a link to find another flight. This can’t be undone.
          </p>
          <Field label="Reason (shown to travellers)" value={form.reason} maxLength={300} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          {action.error && <p className="field-error">{action.error}</p>}
        </Modal>
      )}

      {dialog === 'reschedule' && (
        <Modal
          title="Reschedule this departure"
          onClose={() => setDialog(null)}
          footer={
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={action.busy} aria-busy={action.busy || undefined} onClick={() => run(() => supplierApi.departures.reschedule(id, form.time), (r) => `Rescheduled. ${r.affected} booking${r.affected === 1 ? '' : 's'} told about the change.`)}>
                {action.busy ? 'Saving…' : 'Reschedule'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            <strong>{affected.bookings}</strong> booking{affected.bookings === 1 ? '' : 's'} will be told. Travellers can keep the new time or cancel for a full refund until 24 hours before it.
          </p>
          <Field label="New departure (IST)" type="datetime-local" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} hint="Within one day of the original time" />
          {action.error && <p className="field-error">{action.error}</p>}
        </Modal>
      )}
    </>
  );
}
