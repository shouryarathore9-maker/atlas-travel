import { Link } from 'react-router-dom';
import OffersTable from '../../components/OffersTable.jsx';
import { adminApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export default function AdminOffers() {
  useDocumentTitle('Admin · Offers');
  return (
    <>
      <div className="spread">
        <h1 className="console-h1">Offers</h1>
        <Link to="/admin/offers/new" className="btn btn-primary">
          Create platform offer
        </Link>
      </div>
      <p className="muted">
        Atlas-funded offers you create, and every supplier’s offer. You can pause any offer (the kill switch); suppliers edit their own. Every change is in the audit log.
      </p>
      <OffersTable api={adminApi.offers} base="/admin/offers" admin />
    </>
  );
}
