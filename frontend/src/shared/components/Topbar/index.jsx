import { t, useLocale, LanguageSwitcher } from '../../../i18n/index';
import { useAuth } from '../../../contexts/AuthContext';
import { LogOut, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import './index.scss';

function pageLabel(pathname) {
  if (pathname.includes('change-password')) return t('Change password');
  if (pathname.startsWith('/admin/exam-schedule')) return t('Exam schedule');
  if (pathname.startsWith('/student/results')) return t('Results');
  if (pathname.startsWith('/admin/users')) return t("Users");
  if (pathname.startsWith('/admin/subjects')) return t("Subjects");
  if (pathname.startsWith('/lecturer/evaluation')) return t("Evaluation review");
  if (pathname.startsWith('/lecturer/exam-sessions')) return t("Exam sessions");
  if (pathname.startsWith('/lecturer/sessions')) return t("Sessions");
  if (pathname.startsWith('/lecturer/questions')) return t("Questions");
  if (pathname.startsWith('/lecturer/rubrics')) return t("Rubrics");
  if (pathname.startsWith('/lecturer/materials')) return t("Materials");
  if (pathname.startsWith('/lecturer/pending-review')) return t("Pending review");
  if (pathname.startsWith('/student/viva')) return t("Viva session");
  if (pathname.startsWith('/student')) return t("Examinations");
  if (pathname.startsWith('/admin')) return t("Admin");
  if (pathname.startsWith('/lecturer')) return t("Dashboard");
  return 'AIVES';
}

function roleLabel(role) {
  if (role === 'LECTURER') return t("Lecturer");
  if (role === 'STUDENT') return t("Student");
  if (role === 'ADMIN') return t("Admin");
  return t("Guest");
}

function initials(name) {
  if (!name) return '—';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Topbar({ onMenuClick, menuOpen = false }) {
  useLocale();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const label = roleLabel(user?.role);
  const displayName = user?.fullName || user?.name || user?.email || 'Guest';

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="topbar">
      <div className="topbar-leading">
        <Button
          variant="secondary"
          className="btn-icon topbar-menu"
          onClick={onMenuClick}
          aria-label={t("Open navigation")}
          aria-expanded={menuOpen}
        >
          <Menu size={18} />
        </Button>
        <p className="topbar-crumb">
          <span>{label}</span>
          <span aria-hidden="true">/</span>
          <strong>{pageLabel(location.pathname)}</strong>
        </p>
      </div>

      <div className="topbar-user">
        <LanguageSwitcher />
        <div className="topbar-identity">
          <div className="topbar-avatar" aria-hidden="true">
            {initials(displayName)}
          </div>
          <div>
            <div className="topbar-name">{displayName}</div>
            <div className="topbar-role">{label}</div>
          </div>
        </div>

        <Button variant="secondary" onClick={handleLogout} icon={<LogOut size={16} />} aria-label={t("Sign out")}>
          <span className="sign-out-label">{t("Sign out")}</span>
        </Button>
      </div>
    </header>
  );
}
