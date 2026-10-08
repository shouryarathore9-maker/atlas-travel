import { Link, useOutletContext } from 'react-router-dom';
import OffersTable from '../../components/OffersTable.jsx';
import { supplierApi } from '../../api/resources.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export default function SupplierOffers() {
  const { supplier } = useOutletContext();
  useDocumentTitle(`${supplier.name} · Offers`);
  return (
    <>
      <div className="spread">
        <h1 className="console-h1">Offers</h1>
        <Link to="/supplier/offers/new" className="btn btn-primary">
          Create offer
        </Link>
      </div>
      <p className="muted">Offers you fund, for your own {supplier.kind === 'airline' ? 'flights' : 'hotel'} only. They show on Atlas’s Offers page straight away; there’s no approval step.</p>
      <OffersTable api={supplierApi.offers} base="/supplier/offers" />
    </>
  );
}
