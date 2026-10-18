import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Login from '../features/auth/login';
import ForgetPassword from '../features/auth/forgetPassword';
import LecturerDashboard from '../features/lecturer-dashboard/pages';
import LecturerQuestions from '../features/question-bank/pages';
import LecturerRubrics from '../features/rubric/pages';
import LecturerEvaluationReview from '../features/grading/pages/evaluation';
import LecturerSessions from '../features/grading/pages/sessions';
import StudentDashboard from '../features/viva-room/pages/dashboard';
import StudentVivaSession from '../features/viva-room/pages/session';
import Sidebar from '../shared/components/Sidebar';
import Topbar from '../shared/components/Topbar';

const ProtectedRoute = ({ allowedRole }) => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <Topbar menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forget-password" element={<ForgetPassword />} />

        <Route path="/lecturer" element={<ProtectedRoute allowedRole="lecturer" />}>
          <Route index element={<LecturerDashboard />} />
          <Route path="sessions" element={<LecturerSessions />} />
          <Route path="questions" element={<LecturerQuestions />} />
          <Route path="rubrics" element={<LecturerRubrics />} />
          <Route path="evaluation/:id" element={<LecturerEvaluationReview />} />
        </Route>

        <Route path="/student" element={<ProtectedRoute allowedRole="student" />}>
          <Route index element={<StudentDashboard />} />
          <Route path="viva" element={<StudentVivaSession />} />
        </Route>
      </Routes>
    </Router>
  );
}
