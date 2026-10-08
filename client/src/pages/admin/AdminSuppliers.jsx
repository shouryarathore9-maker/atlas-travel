import { useState } from 'react';
import Field from '../../components/Field.jsx';
import Modal from '../../components/Modal.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate } from '../../lib/format.js';

// Suspend or reactivate a supplier (prd.md → Admin console → Suppliers). Suspending hides its listings
// and offers, stops new bookings and locks its manager out; existing bookings are untouched.
export default function AdminSuppliers() {
  useDocumentTitle('Admin · Suppliers');
  const { data, error, reload } = useAsync((signal) => adminApi.suppliers({ signal }), []);
  const [suspending, setSuspending] = useState(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  const [notice, setNotice] = useState(null);

  async function act(run, message) {
    setState({ busy: true, error: null });
    try {
      await run();
      setState({ busy: false, error: null });
      setSuspending(null);
      setNotice(message);
      reload();
    } catch (e) {
      setState({ busy: false, error: e.details?.[0]?.message || e.message });
    }
  }

  const openSuspend = (s) => {
    setSuspending(s);
    setReason('');
    setState({ busy: false, error: null });
  };

  return (
    <>
      <h1 className="console-h1">Suppliers</h1>
      <p className="muted">Every airline and hotel on Atlas. Suspending one takes its flights or rooms off sale and locks its manager out until you reactivate it.</p>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={6} height={52} />}
      {data && data.suppliers.length === 0 && <EmptyState title="No suppliers yet" />}
      {data && data.suppliers.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col">Manager</th>
                <th scope="col">Upcoming bookings</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((s) => (
                <tr key={s._id}>
                  <td>
                    <strong>{s.name}</strong>
                    <span className="block small muted">{s.kind === 'airline' ? `Airline${s.code ? ` · ${s.code}` : ''}` : 'Hotel'}</span>
                  </td>
                  <td className="small">{s.manager ? s.manager.email : <span className="muted">No manager</span>}</td>
                  <td>{s.upcomingBookings}</td>
                  <td>
                    {s.status === 'suspended' ? (
                      <>
                        <span className="badge badge-error">Suspended</span>
                        <span className="block small muted">
                          {formatDate(s.suspension.at, { year: undefined })} · {s.suspension.reason}
                        </span>
                      </>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                  <td>
                    {s.status === 'suspended' ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={state.busy}
                        onClick={() => act(() => adminApi.reactivateSupplier(s._id), `${s.name} is active again. Its listings are back in search and its manager can sign in.`)}
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openSuspend(s)}>
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.error && !suspending && <p className="field-error">{state.error}</p>}

      {suspending && (
        <Modal
          title={`Suspend ${suspending.name}?`}
          onClose={() => setSuspending(null)}
          footer={
            <div className="row">
              <button type="submit" form="suspend-form" className="btn btn-danger" disabled={state.busy}>
                {state.busy ? 'Suspending…' : 'Suspend supplier'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setSuspending(null)} disabled={state.busy}>
                Keep active
              </button>
            </div>
          }
        >
          <ul className="small">
            <li>Its {suspending.kind === 'airline' ? 'flights' : 'rooms'} and offers disappear from search, and new bookings are refused.</li>
            <li>Its manager is signed out and can’t sign in.</li>
            <li>
              The {suspending.upcomingBookings} upcoming booking{suspending.upcomingBookings === 1 ? '' : 's'} stay exactly as they are.
            </li>
          </ul>
          <form
            id="suspend-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              act(() => adminApi.suspendSupplier(suspending._id, reason.trim()), `${suspending.name} is suspended.`);
            }}
          >
            <Field label="Reason (kept in the audit log)" as="textarea" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} error={state.error} />
          </form>
        </Modal>
      )}
    </>
  );
}
