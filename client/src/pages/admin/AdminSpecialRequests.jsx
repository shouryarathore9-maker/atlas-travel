import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, SkeletonList } from '../../components/States.jsx';
import { adminApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate } from '../../lib/format.js';

// Read-only list (prd.md → Workflow 4): admin can see requests and replies but isn't notified.
export default function AdminSpecialRequests() {
  useDocumentTitle('Admin · Special requests');
  const { data, error, reload } = useAsync((signal) => adminApi.specialRequests({ signal }), []);
  return (
    <>
      <h1 className="console-h1">Special requests</h1>
      <p className="muted">Every request travellers made and the airline’s or hotel’s reply. Read-only — suppliers answer them.</p>
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={4} height={52} />}
      {data && data.items.length === 0 && <EmptyState title="No special requests yet" />}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table audit-table">
            <thead>
              <tr>
                <th scope="col">Travel</th>
                <th scope="col">Booking</th>
                <th scope="col">Supplier</th>
                <th scope="col">Request</th>
                <th scope="col">Reply</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b._id}>
                  <td>{formatDate(b.travelDates.start, { year: undefined })}</td>
                  <td>
                    <Link to={`/admin/bookings/${b.bookingReference}`}>{b.bookingReference}</Link>
                  </td>
                  <td>{b.supplierName}</td>
                  <td>{b.specialRequest.text}</td>
                  <td>
                    {b.specialRequest.reply ? (
                      <>
                        {b.specialRequest.reply.status === 'accepted' ? 'Accepted' : 'Can’t accommodate'}
                        {b.specialRequest.reply.comment && <span className="block small muted">{b.specialRequest.reply.comment}</span>}
                      </>
                    ) : (
                      <span className="muted">Waiting</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
