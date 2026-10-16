import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoadingSpinner } from './components/ui/Loading';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import SetPassword from './pages/SetPassword';
import ChangePassword from './pages/ChangePassword';
import LecturerDashboard from './pages/lecturer/Dashboard';
import LecturerQuestions from './pages/lecturer/Questions';
import LecturerRubrics from './pages/lecturer/Rubrics';
import LecturerMaterials from './pages/lecturer/Materials';
import LecturerPendingReview from './pages/lecturer/PendingReview';
import LecturerEvaluationReview from './pages/lecturer/EvaluationReview';
import LecturerSessions from './pages/lecturer/Sessions';
import LecturerExamSessions from './pages/lecturer/ExamSessions';
import StudentDashboard from './pages/student/Dashboard';
import StudentVivaSession from './pages/student/VivaSession';
import AdminUsers from './pages/admin/Users';
import AdminSubjects from './pages/admin/Subjects';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

// Maps the server's uppercase role to its route home.
const roleHome = {
  ADMIN: '/admin',
  LECTURER: '/lecturer',
  STUDENT: '/student',
};

const ProtectedRoute = ({ allowedRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner size={32} text="Loading your session..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to={roleHome[user.role] || '/'} replace />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/set-password" element={<SetPassword mode="SET" />} />
          <Route path="/reset-password" element={<SetPassword mode="RESET" />} />

          <Route path="/admin" element={<ProtectedRoute allowedRole="ADMIN" />}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="subjects" element={<AdminSubjects />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          <Route path="/lecturer" element={<ProtectedRoute allowedRole="LECTURER" />}>
            <Route index element={<LecturerDashboard />} />
            <Route path="sessions" element={<LecturerSessions />} />
            <Route path="exam-sessions" element={<LecturerExamSessions />} />
            <Route path="questions" element={<LecturerQuestions />} />
            <Route path="rubrics" element={<LecturerRubrics />} />
            <Route path="materials" element={<LecturerMaterials />} />
            <Route path="pending-review" element={<LecturerPendingReview />} />
            <Route path="evaluation/:id" element={<LecturerEvaluationReview />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>

          <Route path="/student" element={<ProtectedRoute allowedRole="STUDENT" />}>
            <Route index element={<StudentDashboard />} />
            <Route path="viva" element={<StudentVivaSession />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
