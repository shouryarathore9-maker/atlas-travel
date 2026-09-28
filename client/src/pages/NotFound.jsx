import { Link } from 'react-router-dom';
import { EmptyState } from '../components/States.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <main id="main" className="container page">
      <EmptyState title="This page took a wrong turn" action={<Link to="/" className="btn btn-secondary">Back to home</Link>}>
        The link may be old, or the page may have moved.
      </EmptyState>
    </main>
  );
}
