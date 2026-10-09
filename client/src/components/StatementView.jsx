import { formatDate, formatPrice } from '../lib/format.js';

const KIND = {
  completed: 'Completed',
  cancellation_fee: 'Cancellation fee',
  supplier_cancelled: 'Cancelled by you',
  adjustment: 'Adjustment',
  balance: 'Balance carried',
};

const signed = (n) => (n < 0 ? `−${formatPrice(-n)}` : formatPrice(n));
const pct = (rate) => `${Math.round(rate * 1000) / 10}%`;

export function StatementStatus({ statement }) {
  if (statement.status === 'paid') return <span className="badge badge-success">Paid</span>;
  if (statement.status === 'carried') return <span className="badge badge-muted">Nothing to pay · carried forward</span>;
  return <span className="badge badge-olive">Ready · awaiting payment</span>;
}

// A frozen monthly settlement statement (prd.md → Settlement). `admin` adds Atlas's take; `lineAction`
// renders an action for a line (the supplier's "Query this line").
export default function StatementView({ statement, queries = [], admin = false, lineAction, supplierKind }) {
  const t = statement.totals;
  const queryFor = (ref) => queries.find((q) => q.bookingReference === ref && q.status !== 'resolved') || queries.find((q) => q.bookingReference === ref);
  const kinds = { ...KIND, supplier_cancelled: admin ? 'Supplier cancelled' : supplierKind === 'hotel' ? 'Cancelled by the hotel' : 'Cancelled by the airline' };
  return (
    <>
      <div className="kpi-strip statement-totals">
        <div className="kpi">
          <p className="kpi-label">Gross before discount</p>
          <p className="kpi-value">{formatPrice(t.gross)}</p>
          <p className="kpi-change">{t.lines} lines</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Discounts</p>
          <p className="kpi-value">{formatPrice(t.discountPlatform + t.discountSupplier)}</p>
          <p className="kpi-change">
            Atlas-funded {formatPrice(t.discountPlatform)} · {admin ? 'supplier' : 'you'} {formatPrice(t.discountSupplier)}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Commission ({pct(statement.commissionRate)})</p>
          <p className="kpi-value">{formatPrice(t.commission)}</p>
          <p className="kpi-change">Refunds {formatPrice(t.refunds)}</p>
        </div>
        {Boolean(t.adjustments || t.balance) && (
          <div className="kpi">
            <p className="kpi-label">Adjustments</p>
            <p className="kpi-value">{signed((t.adjustments || 0) + (t.balance || 0))}</p>
            <p className="kpi-change">
              {[t.adjustments ? `Corrections ${signed(t.adjustments)}` : null, t.balance ? `Carried from last month ${signed(t.balance)}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
        <div className="kpi">
          <p className="kpi-label">{admin ? 'Net owed to supplier' : 'Net owed to you'}</p>
          <p className="kpi-value">{signed(t.net)}</p>
          <p className="kpi-change">{admin ? `Atlas keeps ${signed(t.atlasTake)}` : <StatementStatus statement={statement} />}</p>
        </div>
      </div>
      {statement.status === 'carried' && (
        <p className="small muted">Nothing is paid for this month: {formatPrice(-t.net)} is carried to the next statement as an opening balance.</p>
      )}
      {statement.status === 'paid' && (
        <p className="small muted">
          Paid {formatDate(statement.paidAt)} · reference {statement.paymentRef} (simulated)
        </p>
      )}
      <div className="table-wrap">
        <table className="admin-table statement-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Booking</th>
              <th scope="col" className="num">
                Gross
              </th>
              <th scope="col" className="num">
                Discount
              </th>
              <th scope="col" className="num">
                Refunds
              </th>
              <th scope="col" className="num">
                Commission
              </th>
              <th scope="col" className="num">
                Net
              </th>
              {admin && (
                <th scope="col" className="num">
                  Atlas keeps
                </th>
              )}
              {lineAction && (
                <th scope="col">
                  <span className="sr-only">Query</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {statement.lines.map((l, i) => {
              const query = l.bookingReference ? queryFor(l.bookingReference) : null;
              const discount = l.discountPlatform + l.discountSupplier;
              return (
                <tr key={`${l.bookingReference}-${l.kind}-${i}`}>
                  <td>{formatDate(l.date, { year: undefined })}</td>
                  <td>
                    <strong>{l.bookingReference || '—'}</strong> <span className="small muted">{kinds[l.kind]}</span>
                    <span className="block small muted">{l.kind === 'adjustment' ? `${l.description}: ${l.note}` : l.description}</span>
                    {query && <span className="block small">Query: {query.status === 'resolved' ? (query.resolution?.kind === 'adjustment' ? `adjustment ${signed(query.resolution.amount)}` : 'no change') : 'open'}</span>}
                  </td>
                  <td className="num">{l.gross ? formatPrice(l.gross) : '—'}</td>
                  <td className="num">
                    {discount ? (
                      <>
                        {formatPrice(discount)}
                        <span className="block small muted">{l.discountPlatform ? 'Atlas-funded' : admin ? 'Supplier-funded' : 'You fund'}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{l.refunds ? formatPrice(l.refunds) : '—'}</td>
                  <td className="num">{l.commission ? formatPrice(l.commission) : '—'}</td>
                  <td className="num">
                    <strong>{signed(l.net)}</strong>
                  </td>
                  {admin && <td className={`num ${l.atlasTake < 0 ? 'text-error' : ''}`}>{signed(l.atlasTake)}</td>}
                  {lineAction && <td>{lineAction(l, query)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
