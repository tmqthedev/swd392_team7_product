import './index.scss';

export function Table({ children, className = '', ...props }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table {...props}>{children}</table>
    </div>
  );
}

export function Thead({ children, ...props }) {
  return <thead {...props}>{children}</thead>;
}

export function Tbody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>;
}

export function Tr({ children, ...props }) {
  return <tr {...props}>{children}</tr>;
}

export function Th({ children, ...props }) {
  return <th scope="col" {...props}>{children}</th>;
}

export function Td({ children, ...props }) {
  return <td {...props}>{children}</td>;
}
