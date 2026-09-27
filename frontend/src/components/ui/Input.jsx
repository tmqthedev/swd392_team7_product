import React from 'react';

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className={`form-group ${className}`}>
      {label && <label className="form-label">{label}</label>}
      <input className="form-input" {...props} />
      {error && <div style={{ color: 'var(--accent)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</div>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className={`form-group ${className}`}>
      {label && <label className="form-label">{label}</label>}
      <textarea className="form-textarea" rows={4} {...props} />
      {error && <div style={{ color: 'var(--accent)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</div>}
    </div>
  );
}
