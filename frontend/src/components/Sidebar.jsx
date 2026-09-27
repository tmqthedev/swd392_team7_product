import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, CheckSquare, LayoutDashboard, Mic, ClipboardList } from 'lucide-react';

export default function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="sidebar glass-panel" style={{ borderRadius: 0, borderRight: '1px solid var(--border)', borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
      <div style={{ padding: '0 0.5rem 2rem 0.5rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <Mic size={24} />
          <span>AIVES</span>
        </h2>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {user?.role === 'lecturer' ? (
          <>
            <NavLink to="/lecturer" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/lecturer/sessions" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <ClipboardList size={20} />
              <span>Sessions</span>
            </NavLink>
            <NavLink to="/lecturer/questions" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <BookOpen size={20} />
              <span>Questions</span>
            </NavLink>
            <NavLink to="/lecturer/rubrics" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <CheckSquare size={20} />
              <span>Rubrics</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/student" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
