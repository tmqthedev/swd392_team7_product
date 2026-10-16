import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, CheckSquare, LayoutDashboard, Mic, ClipboardList, Users, Library, KeyRound, FileText, Inbox } from 'lucide-react';

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <aside className="sidebar glass-panel" style={{ borderRadius: 0, borderRight: '1px solid var(--border)', borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
      <div style={{ padding: '0 0.5rem 2rem 0.5rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <Mic size={24} />
          <span>AIVES</span>
        </h2>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {role === 'ADMIN' && (
          <>
            <NavLink to="/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Users size={20} />
              <span>Users</span>
            </NavLink>
            <NavLink to="/admin/subjects" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Library size={20} />
              <span>Subjects</span>
            </NavLink>
            <NavLink to="/admin/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <KeyRound size={20} />
              <span>Change Password</span>
            </NavLink>
          </>
        )}

        {role === 'LECTURER' && (
          <>
            <NavLink to="/lecturer" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/lecturer/sessions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <ClipboardList size={20} />
              <span>Sessions</span>
            </NavLink>
            <NavLink to="/lecturer/questions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <BookOpen size={20} />
              <span>Questions</span>
            </NavLink>
            <NavLink to="/lecturer/rubrics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <CheckSquare size={20} />
              <span>Rubrics</span>
            </NavLink>
            <NavLink to="/lecturer/materials" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <FileText size={20} />
              <span>Materials</span>
            </NavLink>
            <NavLink to="/lecturer/pending-review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Inbox size={20} />
              <span>Pending Review</span>
            </NavLink>
            <NavLink to="/lecturer/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <KeyRound size={20} />
              <span>Change Password</span>
            </NavLink>
          </>
        )}

        {role === 'STUDENT' && (
          <>
            <NavLink to="/student" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/student/change-password" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <KeyRound size={20} />
              <span>Change Password</span>
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
