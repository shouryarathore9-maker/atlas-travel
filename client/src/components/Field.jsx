import { useId } from 'react';

// Labeled input with inline error. Pass `as="select"` or `as="textarea"` for other controls.
// `valid` (optional): true once the field has been touched and passes — shows the quiet green state.
export default function Field({ label, error, hint, optional, valid = false, as = 'input', className = '', children, ...props }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const Control = as;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field ${valid && !error ? 'is-valid' : ''} ${className}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="optional">(optional)</span>}
      </label>
      <Control
        id={id}
        className={as === 'select' ? 'select' : as === 'textarea' ? 'textarea' : 'input'}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {children}
      </Control>
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
