import './index.scss';

export function Input({ label, error, className = '', id, ...props }) {
  const inputId = id || props.name;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label className="form-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className="form-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorId}
        {...props}
      />
      {error && <div className="form-error" id={errorId}>{error}</div>}
    </div>
  );
}

export function Textarea({ label, error, className = '', id, ...props }) {
  const inputId = id || props.name;

  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label className="form-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <textarea id={inputId} className="form-textarea" rows={4} {...props} />
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
