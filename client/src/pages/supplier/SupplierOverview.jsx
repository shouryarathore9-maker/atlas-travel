import { useOutletContext } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { changeLabel } from '../../lib/consoleForm.js';
import { formatDateTime, formatPrice, formatDate } from '../../lib/format.js';

function Kpi({ label, value, current, previous }) {
  const up = current >= previous;
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className={`kpi-change ${previous ? (up ? 'is-up' : 'is-down') : ''}`}>{changeLabel(current, previous)}</p>
    </div>
  );
}

export default function SupplierOverview() {
  const { supplier, overview } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Overview`);
  const { kpis, upcoming } = overview.data;
  const isAirline = supplier.kind === 'airline';

  return (
    <>
      <h1 className="console-h1">Overview</h1>
      <p className="muted">Bookings made in the last 30 days, compared with the 30 days before.</p>
      <div className="kpi-strip">
        <Kpi label="Bookings" value={kpis.bookings.current} current={kpis.bookings.current} previous={kpis.bookings.previous} />
        <Kpi label="Gross booking value" value={formatPrice(kpis.revenue.current)} current={kpis.revenue.current} previous={kpis.revenue.previous} />
      </div>

      <section className="console-section">
        <h2 className="h3">{isAirline ? 'Departures today and tomorrow' : 'Arrivals today and tomorrow'}</h2>
        {upcoming.length === 0 ? (
          <p className="muted">{isAirline ? 'No departures in the next two days.' : 'No guests arriving in the next two days.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                {isAirline ? (
                  <tr>
                    <th scope="col">Departs</th>
                    <th scope="col">Flight</th>
                    <th scope="col">Route</th>
                    <th scope="col">Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th scope="col">Check-in</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Lead guest</th>
                    <th scope="col">Room</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {upcoming.map((item) =>
                  isAirline ? (
                    <tr key={item._id}>
                      <td>{formatDateTime(item.departureTime)}</td>
                      <td>{item.flightNumber}</td>
                      <td>
                        {item.origin.code} → {item.destination.code}
                      </td>
                      <td>{item.status === 'cancelled' ? 'Cancelled' : item.salesStopped ? 'Sales stopped' : 'On sale'}</td>
                    </tr>
                  ) : (
                    <tr key={item._id}>
                      <td>{formatDate(item.travelDates.start)}</td>
                      <td>{item.bookingReference}</td>
                      <td>{item.travellers?.[0]?.name}</td>
                      <td>
                        {item.selection.roomTypeName} × {item.selection.rooms}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
