import React from 'react';

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={`card-header ${className}`} style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '', ...props }) {
  return (
    <div className={`card-body ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={`card-footer ${className}`} style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }} {...props}>
      {children}
    </div>
  );
}
