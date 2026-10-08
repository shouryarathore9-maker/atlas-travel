import { useRef, useState } from 'react';
import Field from '../components/Field.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../components/States.jsx';
import { meApi } from '../api/resources.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { NAME_PART_MAX, namePartError } from '../lib/validation.js';

const TYPES = { adult: 'Adult (12+)', child: 'Child (2–11)', infant: 'Infant (under 2)' };
const blank = { firstName: '', lastName: '', ageCategory: 'adult' };

// Saved travellers (prd.md → Saved travellers): up to 20, used by the picker at checkout.
export default function SavedTravellers() {
  useDocumentTitle('Saved travellers');
  const { data, error, reload, setData } = useAsync((signal) => meApi.travellers({ signal }), []);
  const [editing, setEditing] = useState(null); // 'new' | id
  const [form, setForm] = useState(blank);
  const [state, setState] = useState({ busy: false, error: null, touched: false });
  const saving = useRef(false);
  const [notice, setNotice] = useState(null);

  const errors = { firstName: namePartError(form.firstName, 'first name'), lastName: namePartError(form.lastName, 'last name') };
  const startEdit = (t) => {
    setEditing(t ? t._id : 'new');
    setForm(t ? { firstName: t.firstName, lastName: t.lastName, ageCategory: t.ageCategory } : blank);
    setState({ busy: false, error: null, touched: false });
  };

  async function save(e) {
    e.preventDefault();
    if (saving.current) return; // a second tap before the button disables
    setState((s) => ({ ...s, touched: true }));
    if (errors.firstName || errors.lastName) return;
    saving.current = true;
    setState({ busy: true, error: null, touched: true });
    try {
      const body = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), ageCategory: form.ageCategory };
      setData(editing === 'new' ? await meApi.addTraveller(body) : await meApi.updateTraveller(editing, body));
      setNotice(`${body.firstName} ${body.lastName} was saved.`);
      setEditing(null);
    } catch (err) {
      setState({ busy: false, error: err.message, touched: true });
    } finally {
      saving.current = false;
    }
  }

  async function remove(t) {
    try {
      setData(await meApi.removeTraveller(t._id));
      setNotice(`${t.firstName} ${t.lastName} was removed.`);
    } catch (err) {
      setNotice(err.message);
    }
  }

  const list = data?.travellers || [];
  const form_ = editing && (
    <form className="card stack" onSubmit={save} noValidate>
      <h2 className="h4">{editing === 'new' ? 'Add a traveller' : 'Edit traveller'}</h2>
      <div className="form-grid cols-3">
        <Field label="First name" maxLength={NAME_PART_MAX} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} error={state.touched ? errors.firstName : undefined} />
        <Field label="Last name" maxLength={NAME_PART_MAX} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} error={state.touched ? errors.lastName : undefined} />
        <Field as="select" label="Type" value={form.ageCategory} onChange={(e) => setForm({ ...form, ageCategory: e.target.value })}>
          {Object.entries(TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Field>
      </div>
      {state.error && <p className="field-error">{state.error}</p>}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={state.busy}>
          {state.busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <main id="main" className="container page narrow">
      <div className="spread">
        <h1>Saved travellers</h1>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(null)} disabled={list.length >= 20}>
          Add
        </button>
      </div>
      <p className="muted">People you often book for. Pick them at checkout to fill their names. Up to 20.</p>
      {notice && (
        <Banner tone="success">
          <p>{notice}</p>
        </Banner>
      )}
      {editing === 'new' && form_}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!error && !data && <SkeletonList count={2} height={56} />}
      {data && list.length === 0 && editing !== 'new' && <EmptyState title="No saved travellers yet">Add someone here, or tick “Save” at checkout.</EmptyState>}
      {list.length > 0 && (
        <ul className="plain-list saved-list">
          {list.map((t) => (
            <li key={t._id} className="card saved-row">
              {editing === t._id ? (
                form_
              ) : (
                <div className="spread">
                  <div>
                    <strong>
                      {t.firstName} {t.lastName}
                    </strong>
                    <span className="small muted"> · {TYPES[t.ageCategory]}</span>
                  </div>
                  <div className="row">
                    <button type="button" className="btn-text small" onClick={() => startEdit(t)} aria-label={`Edit ${t.firstName} ${t.lastName}`}>
                      Edit
                    </button>
                    <button type="button" className="btn-text small" onClick={() => remove(t)} aria-label={`Delete ${t.firstName} ${t.lastName}`}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
