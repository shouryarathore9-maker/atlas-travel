import { useSearchParams } from 'react-router-dom';
import Field from '../../components/Field.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDateTime } from '../../lib/format.js';

const ROLE_LABELS = { admin: 'Admin', airline_manager: 'Airline manager', hotel_manager: 'Hotel manager' };

// Before/after snapshots, shown as plain text (never HTML).
function Change({ entry }) {
  if (!entry.before && !entry.after) return null;
  const keys = [...new Set([...Object.keys(entry.before || {}), ...Object.keys(entry.after || {})])].filter(
    (k) => JSON.stringify(entry.before?.[k]) !== JSON.stringify(entry.after?.[k]),
  );
  if (!keys.length) return null;
  return (
    <details className="audit-change">
      <summary className="btn-text small">{keys.length === 1 ? `Changed ${keys[0]}` : `${keys.length} fields changed`}</summary>
      <dl>
        {keys.map((k) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <span className="muted">Before:</span> <code>{entry.before ? JSON.stringify(entry.before[k]) : '—'}</code>
              <br />
              <span className="muted">After:</span> <code>{entry.after ? JSON.stringify(entry.after[k]) : '—'}</code>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default function AuditLog() {
  useDocumentTitle('Admin · Audit log');
  const [params, setParams] = useSearchParams();
  const supplierId = params.get('supplierId') || '';
  const actorRole = params.get('actorRole') || '';
  const page = Number(params.get('page')) || 1;
  const suppliers = useAsync((signal) => adminApi.suppliers({ signal }), []);
  const { data, error, reload } = useAsync((signal) => adminApi.audit({ supplierId, actorRole, page }, { signal }), [supplierId, actorRole, page]);
  const update = (next) => setParams(Object.fromEntries(Object.entries({ supplierId, actorRole, ...next }).filter(([, v]) => v)));

  return (
    <>
      <h1 className="console-h1">Audit log</h1>
      <p className="muted">Every change made by managers and admins: who, what and when. Entries can’t be edited or deleted.</p>
      <div className="row filter-row">
        <Field as="select" label="Supplier" value={supplierId} onChange={(e) => update({ supplierId: e.target.value, page: '' })}>
          <option value="">All suppliers</option>
          {['airline', 'hotel'].map((kind) => (
            <optgroup key={kind} label={kind === 'airline' ? 'Airlines' : 'Hotels'}>
              {suppliers.data?.suppliers
                .filter((s) => s.kind === kind)
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Field>
        <Field as="select" label="Role" value={actorRole} onChange={(e) => update({ actorRole: e.target.value, page: '' })}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={6} height={44} />}
      {data && data.items.length === 0 && <EmptyState title="Nothing logged yet">Staff actions appear here as they happen.</EmptyState>}
      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total} entries</p>
          <div className="table-wrap">
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry._id}>
                    <td>{formatDateTime(entry.at)}</td>
                    <td>
                      {entry.actorName}
                      <br />
                      <span className="small muted">{ROLE_LABELS[entry.actorRole] || entry.actorRole}</span>
                    </td>
                    <td>{entry.supplierName || '—'}</td>
                    <td>
                      <code>{entry.action}</code>
                      {entry.count != null && <span className="small muted"> · {entry.count} bookings</span>}
                    </td>
                    <td>{entry.target?.label}</td>
                    <td>
                      <Change entry={entry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
                Previous
              </button>
              <span className="small">
                Page {page} of {data.pages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
