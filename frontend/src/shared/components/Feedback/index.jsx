import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import './index.scss';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export function Feedback({ type = 'info', message, title, className = '' }) {
  const Icon = icons[type] || Info;

  return (
    <div className={`feedback feedback--${type} ${className}`} role="status">
      <Icon size={18} aria-hidden="true" />
      <div>
        {title && <h4>{title}</h4>}
        <p>{message}</p>
      </div>
    </div>
  );
}
