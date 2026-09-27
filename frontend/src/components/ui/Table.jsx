import React from 'react';

export function Table({ children, className = '', ...props }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table 
        className={className} 
        style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          textAlign: 'left',
          fontSize: '0.875rem'
        }} 
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function Thead({ children, ...props }) {
  return (
    <thead style={{ backgroundColor: 'var(--surface-alt)', borderBottom: '2px solid var(--border)' }} {...props}>
      {children}
    </thead>
  );
}

export function Tbody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>;
}

export function Tr({ children, ...props }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition-fast)' }} {...props}>
      {children}
    </tr>
  );
}

export function Th({ children, ...props }) {
  return (
    <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }} {...props}>
      {children}
    </th>
  );
}

export function Td({ children, ...props }) {
  return (
    <td style={{ padding: '1rem', color: 'var(--text-main)' }} {...props}>
      {children}
    </td>
  );
}
