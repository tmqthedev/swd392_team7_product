import { Loader2 } from 'lucide-react';
import './index.scss';

export function LoadingSpinner({ size = 24, className = '', text = 'Loading...' }) {
  return (
    <div className={`loading-spinner ${className}`}>
      <Loader2 size={size} className="loading-spinner__icon" aria-hidden="true" />
      {text && <span>{text}</span>}
    </div>
  );
}

export function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <LoadingSpinner size={32} />
    </div>
  );
}
