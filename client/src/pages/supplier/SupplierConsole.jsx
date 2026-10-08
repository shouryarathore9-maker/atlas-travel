import ConsoleLayout from '../../components/ConsoleLayout.jsx';
import { ErrorState, Spinner } from '../../components/States.jsx';
import { supplierApi } from '../../api/resources.js';
import { useAsync } from '../../hooks/useAsync.js';

const LINKS = {
  airline: [
    { to: '/supplier', end: true, label: 'Overview', icon: 'chart' },
    { to: '/supplier/services', label: 'Services', icon: 'plane' },
    { to: '/supplier/departures', label: 'Departures', icon: 'calendar' },
  ],
  hotel: [
    { to: '/supplier', end: true, label: 'Overview', icon: 'chart' },
    { to: '/supplier/hotel', label: 'Property & rooms', icon: 'building' },
  ],
};

// Loads the manager's own supplier once and shares it with every console page.
export default function SupplierConsole() {
  const overview = useAsync((signal) => supplierApi.overview({ signal }), []);
  if (overview.error) {
    return (
      <main id="main" className="container page">
        <ErrorState error={overview.error} onRetry={overview.reload} />
      </main>
    );
  }
  if (!overview.data) return <Spinner label="Opening your console…" />;
  const { supplier } = overview.data;
  return (
    <ConsoleLayout
      eyebrow={supplier.kind === 'airline' ? 'Airline console' : 'Hotel console'}
      title={supplier.name}
      links={LINKS[supplier.kind]}
      outletContext={{ supplier, overview }}
    />
  );
}
