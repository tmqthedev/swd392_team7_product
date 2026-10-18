import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { BookOpen, CheckSquare, LayoutDashboard, ClipboardList, X } from 'lucide-react';
import './index.scss';

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const asideRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    asideRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const sessionsActive = location.pathname.startsWith('/lecturer/evaluation');

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside ref={asideRef} className={`sidebar ${isOpen ? 'is-open' : ''}`} tabIndex={-1}>
        <div className="sidebar-brand">
          <strong>AIVES</strong>
          <span>Viva examination</span>
        </div>

        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>

        <nav className="sidebar-nav" aria-label="Main">
          {user?.role === 'lecturer' ? (
            <>
              <NavLink to="/lecturer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end onClick={onClose}>
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/lecturer/sessions"
                className={({ isActive }) => `nav-item ${isActive || sessionsActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <ClipboardList size={18} />
                <span>Sessions</span>
              </NavLink>
              <NavLink to="/lecturer/questions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <BookOpen size={18} />
                <span>Questions</span>
              </NavLink>
              <NavLink to="/lecturer/rubrics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <CheckSquare size={18} />
                <span>Rubrics</span>
              </NavLink>
            </>
          ) : (
            <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end onClick={onClose}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
          )}
        </nav>
      </aside>
    </>
  );
}
