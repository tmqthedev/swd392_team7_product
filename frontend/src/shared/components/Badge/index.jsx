import './index.scss';

export function Badge({ children, type = 'info', className = '', ...props }) {
  const resolvedType = type === 'danger' ? 'error' : type;
  const badgeClass = `badge badge-${resolvedType} ${className}`;

  return (
    <span className={badgeClass} {...props}>
      {children}
    </span>
  );
}
