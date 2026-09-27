import React from 'react';

export function Badge({ children, type = 'info', className = '', ...props }) {
  const badgeClass = `badge badge-${type} ${className}`;
  
  return (
    <span className={badgeClass} {...props}>
      {children}
    </span>
  );
}
