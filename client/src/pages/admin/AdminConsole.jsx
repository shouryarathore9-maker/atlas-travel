import ConsoleLayout from '../../components/ConsoleLayout.jsx';

// Admin console sections are added stage by stage (architecture.md §15).
const LINKS = [
  { to: '/admin/bookings', label: 'Bookings', icon: 'list' },
  { to: '/admin/suppliers', label: 'Suppliers', icon: 'compass' },
  { to: '/admin/tickets', label: 'Tickets', icon: 'alert' },
  { to: '/admin/special-requests', label: 'Special requests', icon: 'check' },
  { to: '/admin/offers', label: 'Offers', icon: 'receipt' },
  { to: '/admin/settlement', label: 'Settlement', icon: 'list' },
  { to: '/admin/settings', label: 'Settings', icon: 'compass' },
  { to: '/admin/audit', label: 'Audit log', icon: 'list' },
];

export default function AdminConsole() {
  return <ConsoleLayout eyebrow="Admin console" title="Atlas platform" links={LINKS} />;
}
