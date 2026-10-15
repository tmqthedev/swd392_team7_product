import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Feedback } from '../components/ui/Feedback';

const roleHome = {
  ADMIN: '/admin',
  LECTURER: '/lecturer',
  STUDENT: '/student',
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(identifier.trim(), password);
      if (user) {
        navigate(roleHome[user.role] || '/', { replace: true });
      } else {
        setError('Unable to resolve your session. Please try again.');
      }
    } catch (err) {
      if (err.status === 423) {
        setError('Your account is temporarily locked. Please try again later.');
      } else {
        setError('Invalid email/code or password.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <motion.div
        className="card glass-panel"
        style={{ maxWidth: '440px', width: '100%', padding: '3rem' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--primary)' }}>
            <Mic size={48} />
          </div>
          <h1 style={{ marginBottom: '0.25rem', fontSize: '2rem' }}>AIVES</h1>
          <p style={{ color: 'var(--text-muted)' }}>AI Viva Examination System</p>
        </div>

        {error && <Feedback type="error" message={error} />}

        <form onSubmit={handleSubmit}>
          <Input
            label="Email or code"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or your code"
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />

          <Button type="submit" variant="primary" isLoading={submitting} style={{ width: '100%', marginTop: '0.5rem' }}>
            Sign in
          </Button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/forgot-password" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>
            Forgot your password?
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
