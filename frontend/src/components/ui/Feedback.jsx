import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

const icons = {
  success: <CheckCircle size={20} />,
  error: <AlertCircle size={20} />,
  info: <Info size={20} />,
  warning: <AlertTriangle size={20} />,
};

const colors = {
  success: { bg: '#D1FAE5', color: '#065F46', border: '#34D399' },
  error: { bg: '#FEE2E2', color: '#991B1B', border: '#F87171' },
  info: { bg: '#DBEAFE', color: '#1E40AF', border: '#60A5FA' },
  warning: { bg: '#FEF3C7', color: '#92400E', border: '#FBBF24' },
};

export function Feedback({ type = 'info', message, title, className = '' }) {
  const style = colors[type];
  
  return (
    <div 
      className={`feedback animate-fade-in ${className}`}
      style={{
        backgroundColor: style.bg,
        color: style.color,
        borderLeft: `4px solid ${style.border}`,
        padding: '1rem',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        marginBottom: '1rem'
      }}
    >
      <div style={{ marginTop: '0.125rem' }}>
        {icons[type]}
      </div>
      <div>
        {title && <h4 style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>{title}</h4>}
        <p style={{ margin: 0, fontSize: '0.875rem' }}>{message}</p>
      </div>
    </div>
  );
}
