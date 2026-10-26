import { t, useLocale } from '../../../i18n/index';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Award,
  BookOpen,
  CalendarClock,
  CalendarPlus,
  CheckSquare,
  ClipboardList,
  FileText,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  Library,
  Users,
  X,
} from 'lucide-react';
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

  const sessionsActive = location.pathname.startsWith('/lecturer/evaluation');

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
              <NavLink
                to="/lecturer/sessions"
                className={({ isActive }) => `nav-item ${isActive || sessionsActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <ClipboardList size={18} />
                <span>{t("Sessions")}</span>
              </NavLink>
              <NavLink to="/lecturer/exam-sessions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <CalendarPlus size={18} />
                <span>{t("Exam sessions")}</span>
              </NavLink>
              <NavLink to="/lecturer/topics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <Layers size={18} />
                <span>{t("Topics")}</span>
              </NavLink>
              <NavLink to="/lecturer/questions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <BookOpen size={18} />
                <span>{t("Questions")}</span>
              </NavLink>
              <NavLink to="/lecturer/rubrics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <CheckSquare size={18} />
                <span>{t("Rubrics")}</span>
              </NavLink>
              <NavLink to="/lecturer/materials" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <FileText size={18} />
                <span>{t("Materials")}</span>
              </NavLink>
              <NavLink to="/lecturer/pending-review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <Inbox size={18} />
                <span>{t("Pending review")}</span>
              </NavLink>
              <NavLink to="/lecturer/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <KeyRound size={18} />
                <span>{t("Change password")}</span>
              </NavLink>
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
