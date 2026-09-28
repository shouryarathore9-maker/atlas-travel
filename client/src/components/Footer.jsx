import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container spread">
        <div>
          <Link to="/" className="logo">
            Atlas
          </Link>
          <p className="small" style={{ marginTop: 'var(--space-2)' }}>
            A learning project. All flights, hotels and payments are simulated.
          </p>
        </div>
        <p className="small">© {new Date().getFullYear()} Atlas</p>
      </div>
    </footer>
  );
}
