import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import LecturerDashboard from './pages/lecturer/Dashboard';
import LecturerQuestions from './pages/lecturer/Questions';
import LecturerRubrics from './pages/lecturer/Rubrics';
import LecturerEvaluationReview from './pages/lecturer/EvaluationReview';
import LecturerSessions from './pages/lecturer/Sessions';
import StudentDashboard from './pages/student/Dashboard';
import StudentVivaSession from './pages/student/VivaSession';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

const ProtectedRoute = ({ allowedRole }) => {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to={`/${user.role}`} replace />;
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
    </AuthProvider>
  );
}
