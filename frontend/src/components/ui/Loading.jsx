import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ size = 24, className = '', text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '2rem' }} className={className}>
      <Loader2 size={size} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      {text && <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{text}</span>}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function LoadingOverlay() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'var(--glass-bg)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <LoadingSpinner size={32} />
    </div>
  );
}
