import { t, useLocale } from '../i18n/index';
import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../shared/components/Loading';
import Login from '../features/auth/login';
import ForgotPassword from '../pages/ForgotPassword';
import SetPassword from '../pages/SetPassword';
import ChangePassword from '../pages/ChangePassword';
import LecturerDashboard from '../pages/lecturer/Dashboard';
import LecturerTopics from '../pages/lecturer/Topics';
import LecturerQuestions from '../pages/lecturer/Questions';
import LecturerRubrics from '../pages/lecturer/Rubrics';
import LecturerMaterials from '../pages/lecturer/Materials';
import LecturerPendingReview from '../pages/lecturer/PendingReview';
import LecturerEvaluationReview from '../pages/lecturer/EvaluationReview';
import LecturerSessions from '../pages/lecturer/Sessions';
import LecturerExamSessions from '../pages/lecturer/ExamSessions';
import StudentDashboard from '../pages/student/Dashboard';
import StudentVivaSession from '../pages/student/VivaSession';
import StudentResults from '../pages/student/Results';
import StudentResultDetail from '../pages/student/ResultDetail';
import AdminUsers from '../pages/admin/Users';
import AdminSubjects from '../pages/admin/Subjects';
import AdminExamSchedule from '../pages/admin/ExamSchedule';
import AdminAuditLog from '../pages/admin/AuditLog';
import Sidebar from '../shared/components/Sidebar';
import Topbar from '../shared/components/Topbar';
import { ErrorPage, ErrorBoundary } from '../shared/components/ErrorPage';

const ProtectedRoute = ({ allowedRole }) => {
  useLocale();
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner size={32} text={t("Loading your session...")} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // A signed-in user opening another role's area gets a 403 page inside their
  // own shell instead of a silent redirect.
  const forbidden = Boolean(allowedRole && user.role !== allowedRole);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t("Skip to content")}</a>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <Topbar menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="page-content">
          <ErrorBoundary embedded resetKey={pathname}>
            {forbidden ? <ErrorPage code={403} embedded /> : <Outlet />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

function TopLevelBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

export default function AppRoutes() {
  useLocale();
  return (
    <Router>
      <TopLevelBoundary>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forget-password" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/set-password" element={<SetPassword mode="SET" />} />
        <Route path="/reset-password" element={<SetPassword mode="RESET" />} />

        <Route path="/admin" element={<ProtectedRoute allowedRole="ADMIN" />}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="subjects" element={<AdminSubjects />} />
          <Route path="exam-schedule" element={<AdminExamSchedule />} />
          <Route path="audit-log" element={<AdminAuditLog />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="*" element={<ErrorPage code={404} embedded />} />
        </Route>

        <Route path="/lecturer" element={<ProtectedRoute allowedRole="LECTURER" />}>
          <Route index element={<LecturerDashboard />} />
          <Route path="sessions" element={<LecturerSessions />} />
          <Route path="exam-sessions" element={<LecturerExamSessions />} />
          <Route path="topics" element={<LecturerTopics />} />
          <Route path="questions" element={<LecturerQuestions />} />
          <Route path="rubrics" element={<LecturerRubrics />} />
          <Route path="materials" element={<LecturerMaterials />} />
          <Route path="pending-review" element={<LecturerPendingReview />} />
          <Route path="evaluation/:id" element={<LecturerEvaluationReview />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="*" element={<ErrorPage code={404} embedded />} />
        </Route>

        <Route path="/student" element={<ProtectedRoute allowedRole="STUDENT" />}>
          <Route index element={<StudentDashboard />} />
          <Route path="viva" element={<StudentVivaSession />} />
          <Route path="results" element={<StudentResults />} />
          <Route path="results/:id" element={<StudentResultDetail />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="*" element={<ErrorPage code={404} embedded />} />
        </Route>

        <Route path="*" element={<ErrorPage code={404} />} />
      </Routes>
      </TopLevelBoundary>
    </Router>
  );
}
