import { useEffect, useId, useRef } from 'react';
import Icon from './Icon.jsx';

// Accessible dialog: focus moves in, Escape closes, focus returns to the opener, Tab stays inside.
export default function Modal({ title, onClose, children, footer }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector('button, [href], input, select, textarea')?.focus();
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select, textarea');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = original;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
        {footer && <div style={{ marginTop: 'var(--space-5)' }}>{footer}</div>}
      </div>
    </div>
  );
}
