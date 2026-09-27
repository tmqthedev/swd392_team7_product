import { useNavigate } from 'react-router-dom';
import { Mic, Play } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StudentDashboard() {
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <motion.div 
        className="card glass-panel" 
        style={{ maxWidth: '600px', width: '100%', textAlign: 'center', padding: '3rem' }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem auto' }}>
          <Mic size={40} />
        </div>
        
        <h2 style={{ marginBottom: '1rem' }}>Welcome to your AI Viva Session</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1.1rem' }}>
          You will be asked a series of questions. Please ensure your microphone is working and you are in a quiet environment.
        </p>
        
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '2.5rem', textAlign: 'left' }}>
          <h4 style={{ color: '#D97706', marginBottom: '0.5rem' }}>Instructions:</h4>
          <ul style={{ color: '#B45309', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
            <li>Speak clearly and directly into the microphone.</li>
            <li>You will have 2 minutes to answer each question.</li>
            <li>AI will generate follow-up questions based on your answers.</li>
          </ul>
        </div>
        
        <button 
          className="btn btn-primary" 
          style={{ padding: '1rem 2rem', fontSize: '1.1rem', borderRadius: 'var(--radius-full)' }}
          onClick={() => navigate('/student/viva')}
        >
          <Play size={20} />
          Start Examination
        </button>
      </motion.div>
    </div>
  );
}
