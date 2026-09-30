import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// Full-screen photo viewer (story #17).
// Closes on Escape or a click outside the photo; ←/→ keys and horizontal swipes change photo.
export default function Lightbox({ photos, index, onIndexChange, onClose, label }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const touchStart = useRef(null);
  const count = photos.length;

  const go = useCallback((delta) => onIndexChange((index + delta + count) % count), [index, count, onIndexChange]);

  // Keep the latest handlers in a ref so the key listener is attached once.
  const handlers = useRef({ go, onClose });
  useEffect(() => {
    handlers.current = { go, onClose };
  });

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e) {
      if (e.key === 'Escape') handlers.current.onClose();
      else if (e.key === 'ArrowLeft') handlers.current.go(-1);
      else if (e.key === 'ArrowRight') handlers.current.go(1);
      else if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalOverflow;
      opener?.focus?.();
    };
  }, []);

  function onTouchStart(e) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      ref={dialogRef}
      // Anything that isn't the photo or a control counts as "outside the image".
      onClick={(e) => {
        if (!e.target.closest('.lightbox-photo, .lightbox-btn')) onClose();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button type="button" ref={closeRef} className="lightbox-btn lightbox-close" onClick={onClose} aria-label="Close photo viewer">
        <Icon name="close" size={24} />
      </button>

      {count > 1 && (
        <button type="button" className="lightbox-btn lightbox-prev" onClick={() => go(-1)} aria-label="Previous photo">
          <Icon name="arrowRight" size={26} style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}

      <img key={photos[index]} className="lightbox-photo" src={photos[index]} alt={`${label}, photo ${index + 1} of ${count}`} draggable="false" />

      {count > 1 && (
        <button type="button" className="lightbox-btn lightbox-next" onClick={() => go(1)} aria-label="Next photo">
          <Icon name="arrowRight" size={26} />
        </button>
      )}

      <p className="lightbox-counter" aria-live="polite">
        {index + 1} / {count}
      </p>
    </div>,
    document.body,
  );
}
