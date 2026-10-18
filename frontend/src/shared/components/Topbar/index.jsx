import { useAuth } from '../../../contexts/AuthContext';
import { LogOut, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import './index.scss';

function pageLabel(pathname) {
  if (pathname.startsWith('/admin/users')) return 'Users';
  if (pathname.startsWith('/admin/subjects')) return 'Subjects';
  if (pathname.startsWith('/lecturer/evaluation')) return 'Evaluation review';
  if (pathname.startsWith('/lecturer/exam-sessions')) return 'Exam sessions';
  if (pathname.startsWith('/lecturer/sessions')) return 'Sessions';
  if (pathname.startsWith('/lecturer/questions')) return 'Questions';
  if (pathname.startsWith('/lecturer/rubrics')) return 'Rubrics';
  if (pathname.startsWith('/lecturer/materials')) return 'Materials';
  if (pathname.startsWith('/lecturer/pending-review')) return 'Pending review';
  if (pathname.startsWith('/student/viva')) return 'Viva session';
  if (pathname.startsWith('/student')) return 'Examinations';
  if (pathname.includes('change-password')) return 'Change password';
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname.startsWith('/lecturer')) return 'Dashboard';
  return 'AIVES';
}

function roleLabel(role) {
  if (role === 'LECTURER') return 'Lecturer';
  if (role === 'STUDENT') return 'Student';
  if (role === 'ADMIN') return 'Admin';
  return 'Guest';
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
          aria-label="Open navigation"
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
        <div className="topbar-identity">
          <div className="topbar-avatar" aria-hidden="true">
            {initials(displayName)}
          </div>
          <div>
            <div className="topbar-name">{displayName}</div>
            <div className="topbar-role">{label}</div>
          </div>
        </div>

        <Button variant="secondary" onClick={handleLogout} icon={<LogOut size={16} />} aria-label="Sign out">
          <span className="sign-out-label">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
