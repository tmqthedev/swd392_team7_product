import { t, useLocale, translateMessage } from '../../../i18n/index';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import './index.scss';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export function Feedback({ type = 'info', message, title, className = '', onClose }) {
  useLocale();
  const Icon = icons[type] || Info;

  return (
    <div className={`feedback feedback--${type} ${className}`} role="status">
      <Icon size={18} aria-hidden="true" />
      <div style={{ flex: 1 }}>
        {title && <h4>{translateMessage(title)}</h4>}
        <p>{translateMessage(message)}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Dismiss feedback")}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            opacity: 0.8,
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

