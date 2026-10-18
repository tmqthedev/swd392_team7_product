import { useAuth } from '../../../contexts/AuthContext';
import { LogOut, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import './index.scss';

function pageLabel(pathname) {
  if (pathname.startsWith('/lecturer/evaluation')) return 'Evaluation review';
  if (pathname.startsWith('/lecturer/sessions')) return 'Sessions';
  if (pathname.startsWith('/lecturer/questions')) return 'Questions';
  if (pathname.startsWith('/lecturer/rubrics')) return 'Rubrics';
  if (pathname.startsWith('/student/viva')) return 'Viva session';
  if (pathname.startsWith('/student')) return 'Examinations';
  if (pathname.startsWith('/lecturer')) return 'Dashboard';
  return 'AIVES';
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
  const roleLabel = user?.role === 'lecturer' ? 'Lecturer' : user?.role === 'student' ? 'Student' : 'Guest';

  const handleLogout = () => {
    logout();
    navigate('/');
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
          <span>{roleLabel}</span>
          <span aria-hidden="true">/</span>
          <strong>{pageLabel(location.pathname)}</strong>
        </p>
      </div>

      <div className="topbar-user">
        <div className="topbar-identity">
          <div className="topbar-avatar" aria-hidden="true">
            {initials(user?.name)}
          </div>
          <div>
            <div className="topbar-name">{user?.name || 'Guest'}</div>
            <div className="topbar-role">{roleLabel}</div>
          </div>
        </div>

        <Button variant="secondary" onClick={handleLogout} icon={<LogOut size={16} />} aria-label="Sign out">
          <span className="sign-out-label">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
