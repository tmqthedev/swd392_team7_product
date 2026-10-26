import { t, useLocale, translateMessage } from '../../../i18n/index';
import { Loader2 } from 'lucide-react';
import './index.scss';

export function LoadingSpinner({ size = 24, className = '', text = 'Loading...' }) {
  useLocale();
  return (
    <div className={`loading-spinner ${className}`}>
      <Loader2 size={size} className="loading-spinner__icon" aria-hidden="true" />
      {text && <span>{translateMessage(t(text))}</span>}
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
