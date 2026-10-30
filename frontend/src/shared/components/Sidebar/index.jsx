import { t, useLocale } from '../../../i18n/index';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Award,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  Library,
  Users,
  X,
} from 'lucide-react';
import { LECTURER_FLOW } from '../../../config/lecturerFlow';
import './index.scss';

export default function Sidebar({ isOpen, onClose }) {
  useLocale();
  const { user } = useAuth();
  const location = useLocation();
  const asideRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const role = user?.role;

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

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t("Close navigation")}
          onClick={onClose}
        />
      )}
      <aside ref={asideRef} className={`sidebar ${isOpen ? 'is-open' : ''}`} tabIndex={-1}>
        <div className="sidebar-brand">
          <strong>AIVES</strong>
          <span>{t("Viva examination")}</span>
        </div>

        <button type="button" className="sidebar-close" onClick={onClose} aria-label={t("Close navigation")}>
          <X size={18} />
        </button>

        <nav className="sidebar-nav" aria-label={t("Main")}>
          {role === 'ADMIN' && (
            <>
              <NavLink to="/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <Users size={18} />
                <span>{t("Users")}</span>
              </NavLink>
              <NavLink to="/admin/subjects" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <Library size={18} />
                <span>{t("Subjects")}</span>
              </NavLink>
              <NavLink to="/admin/exam-schedule" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <CalendarClock size={18} />
                <span>{t("Exam schedule")}</span>
              </NavLink>
              <NavLink to="/admin/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <KeyRound size={18} />
                <span>{t("Change password")}</span>
              </NavLink>
            </>
          )}

          {role === 'LECTURER' && (
            <>
              <NavLink to="/lecturer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end onClick={onClose}>
                <LayoutDashboard size={18} />
                <span>{t("Dashboard")}</span>
              </NavLink>
              {LECTURER_FLOW.map((section) => (
                <div key={section.title} className="nav-section" role="group" aria-label={t(section.title)}>
                  <div className="nav-section-title">{t(section.title)}</div>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `nav-item ${isActive || (item.alsoActive && location.pathname.startsWith(item.alsoActive)) ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="nav-step" aria-hidden="true">{item.step}</span>
                        <Icon size={18} />
                        <span>{t(item.label)}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ))}
              <div className="nav-section">
                <NavLink to="/lecturer/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <KeyRound size={18} />
                  <span>{t("Change password")}</span>
                </NavLink>
              </div>
            </>
          )}

          {role === 'STUDENT' && (
            <>
              <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end onClick={onClose}>
                <LayoutDashboard size={18} />
                <span>{t("Dashboard")}</span>
              </NavLink>
              <NavLink to="/student/results" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <Award size={18} />
                <span>{t("Results")}</span>
              </NavLink>
              <NavLink to="/student/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <KeyRound size={18} />
                <span>{t("Change password")}</span>
              </NavLink>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
