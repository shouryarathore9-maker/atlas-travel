import ConsoleLayout from '../../components/ConsoleLayout.jsx';

// Admin console sections are added stage by stage (architecture.md §15).
const LINKS = [{ to: '/admin/audit', label: 'Audit log', icon: 'list' }];

export default function AdminConsole() {
  return <ConsoleLayout eyebrow="Admin console" title="Atlas platform" links={LINKS} />;
}
