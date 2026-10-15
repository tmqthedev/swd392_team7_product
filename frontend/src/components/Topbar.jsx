import { useAuth } from '../context/AuthContext';
import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="topbar">
      <div>
        {/* Breadcrumbs or page title could go here */}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.5rem', borderRadius: '50%' }}>
            <User size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user?.fullName || user?.email || 'Guest'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {user?.role ? user.role.toLowerCase() : 'No Role'}
            </div>
          </div>
        </div>

        <button onClick={handleLogout} className="btn btn-secondary btn-icon" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
