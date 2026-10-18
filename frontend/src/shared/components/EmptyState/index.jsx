import './index.scss';

export function EmptyState({ title, children, actions }) {
  return (
    <div className="empty-state">
      {title && <h3>{title}</h3>}
      {children}
      {actions}
    </div>
  );
}
