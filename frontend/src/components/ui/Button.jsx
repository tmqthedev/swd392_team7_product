import React from 'react';

export function Button({ 
  children, 
  variant = 'primary', 
  className = '', 
  icon,
  isLoading,
  ...props 
}) {
  const baseClass = 'btn';
  const variantClass = `btn-${variant}`;
  const fullClass = `${baseClass} ${variantClass} ${className}`;

  return (
    <button className={fullClass} disabled={isLoading || props.disabled} {...props}>
      {isLoading ? (
        <span className="loader-small"></span>
      ) : (
        <>
          {icon && <span className="btn-icon-wrapper">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
