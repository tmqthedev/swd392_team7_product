import { useLocale, enumLabel } from '../../../i18n/index';
import './index.scss';

export function Badge({ children, type = 'info', className = '', ...props }) {
  useLocale();
  const resolvedType = type === 'danger' ? 'error' : type;
  const badgeClass = `badge badge-${resolvedType} ${className}`;

  return (
    <span className={badgeClass} {...props}>
      {typeof children === 'string' ? enumLabel(children) : children}
    </span>
  );
}
