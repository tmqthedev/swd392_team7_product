import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, GraduationCap, Mic } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (role, name) => {
    login(role, name);
    navigate(`/${role}`);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <motion.div 
        className="card glass-panel"
        style={{ maxWidth: '500px', width: '100%', padding: '3rem', textAlign: 'center' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>
          <Mic size={48} />
        </div>
        <h1 style={{ marginBottom: '0.5rem', fontSize: '2rem' }}>AIVES</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '3rem' }}>AI Viva Examination System</p>
        
        <h3 style={{ marginBottom: '1.5rem' }}>Select your role to continue</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            className="btn btn-primary" 
            style={{ padding: '1rem', fontSize: '1.1rem', justifyContent: 'flex-start' }}
            onClick={() => handleLogin('lecturer', 'Dr. Smith')}
          >
            <BookOpen size={24} style={{ marginRight: '1rem' }} />
            Login as Lecturer
          </button>
          
          <button 
            className="btn btn-secondary" 
            style={{ padding: '1rem', fontSize: '1.1rem', justifyContent: 'flex-start' }}
            onClick={() => handleLogin('student', 'John Doe')}
          >
            <GraduationCap size={24} style={{ marginRight: '1rem' }} />
            Login as Student
          </button>
        </div>
      </motion.div>
    </div>
  );
}
