import { useEffect, useRef, useState } from 'react';
import { supplierApi } from '../../api/resources.js';
import { ACCEPTED_TYPES, prepareHotelPhoto } from '../../lib/imageUpload.js';

const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function Tile({ src, label, position, onToggle, children }) {
  return (
    <div className="gallery-tile">
      <button
        type="button"
        className={`gallery-option ${position >= 0 ? 'is-picked' : ''}`}
        aria-pressed={position >= 0}
        aria-label={`${label}${position >= 0 ? `, picked as photo ${position + 1}` : ''}`}
        onClick={onToggle}
      >
        <img src={src} alt="" loading="lazy" />
        {position >= 0 && <span className="gallery-order">{position + 1}</span>}
      </button>
      {children}
    </div>
  );
}

// Hotel photos: the manager's own uploads (up to 4, prepared in the browser) plus the Atlas gallery.
// Photos are used in the order they're picked; the first is the main photo.
export default function PhotoPicker({ value, onChange, gallery, limits, allowUploads = true, error }) {
  const [uploads, setUploads] = useState([]);
  const [status, setStatus] = useState({ busy: false, message: null, tone: null });
  const fileRef = useRef(null);
  const max = limits?.maxHotelPhotos || 6;

  useEffect(() => {
    if (!allowUploads) return;
    supplierApi.hotel
      .uploads()
      .then(({ photos }) => setUploads(photos))
      .catch(() => setStatus({ busy: false, message: 'Your uploaded photos didn’t load.', tone: 'error' }));
  }, [allowUploads]);

  const pick = (src) => {
    if (!value.includes(src) && value.length >= max) {
      setStatus({ busy: false, message: `You can show up to ${max} photos. Unpick one first.`, tone: 'error' });
      return;
    }
    setStatus({ busy: false, message: null, tone: null });
    onChange(toggle(value, src));
  };

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus({ busy: true, message: 'Preparing and uploading…', tone: null });
    try {
      const blob = await prepareHotelPhoto(file, limits.maxBytes);
      const { photo } = await supplierApi.hotel.upload(blob);
      setUploads((list) => [...list, photo]);
      if (value.length < max) onChange([...value, photo.url]);
      setStatus({ busy: false, message: `Uploaded (${Math.round(photo.size / 1024)} KB). Save changes to show it on your hotel page.`, tone: 'success' });
    } catch (err) {
      setStatus({ busy: false, message: err.message, tone: 'error' });
    }
  }

  async function remove(photo) {
    setStatus({ busy: true, message: null, tone: null });
    try {
      await supplierApi.hotel.removeUpload(photo._id);
      setUploads((list) => list.filter((p) => p._id !== photo._id));
      setStatus({ busy: false, message: 'Photo deleted.', tone: 'success' });
    } catch (err) {
      setStatus({ busy: false, message: err.message, tone: 'error' });
    }
  }

  const full = uploads.length >= (limits?.maxCount || 4);
  return (
    <div className="photo-picker">
      {allowUploads && (
        <>
          <div className="spread">
            <h3 className="h4">Your uploads</h3>
            <span className="small muted">
              {uploads.length} of {limits?.maxCount || 4}
            </span>
          </div>
          <p className="small muted">
            JPEG, PNG or WebP, at least 400 × 300 pixels. Large photos are resized in your browser before upload (location data is removed). Unused
            uploads are deleted after a day.
          </p>
          {uploads.length > 0 && (
            <div className="gallery-picker">
              {uploads.map((p, i) => (
                <Tile key={p._id} src={p.url} label={`Your upload ${i + 1}`} position={value.indexOf(p.url)} onToggle={() => pick(p.url)}>
                  {!value.includes(p.url) && (
                    <button type="button" className="btn-text small" onClick={() => remove(p)} disabled={status.busy}>
                      Delete
                    </button>
                  )}
                </Tile>
              ))}
            </div>
          )}
          <div className="row upload-row">
            <input ref={fileRef} type="file" accept={ACCEPTED_TYPES.join(',')} className="sr-only" id="photo-upload" onChange={upload} disabled={full || status.busy} />
            <label htmlFor="photo-upload" className={`btn btn-secondary btn-sm ${full || status.busy ? 'is-disabled' : ''}`} aria-disabled={full || status.busy}>
              {status.busy ? 'Uploading…' : 'Upload a photo'}
            </label>
            {full && <span className="small muted">Delete an upload you don’t use to add another.</span>}
          </div>
        </>
      )}
      {status.message && (
        <p className={`small ${status.tone === 'error' ? 'field-error' : status.tone === 'success' ? 'text-success' : 'muted'}`} role="status">
          {status.message}
        </p>
      )}

      <h3 className="h4" style={{ marginTop: 'var(--space-4)' }}>
        Atlas gallery
      </h3>
      <div className="gallery-picker" role="group" aria-label="Atlas photo gallery">
        {gallery.map((src) => (
          <Tile key={src} src={src} label={`Gallery photo ${src.match(/(\d+)\.jpg$/)?.[1]}`} position={value.indexOf(src)} onToggle={() => pick(src)} />
        ))}
      </div>
      {error && (
        <p id="photos-error" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
