import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Feedback } from '../components/ui/Feedback';
import { postSetPassword, postResetPassword } from '../services/authApi';

// `mode` is 'SET' (account setup link) or 'RESET' (forgot-password link); both
// read the single-use token from the ?token= query parameter.
export default function SetPassword({ mode = 'SET' }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const title = mode === 'RESET' ? 'Set a new password' : 'Set up your password';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'RESET') {
        await postResetPassword(token, password);
      } else {
        await postSetPassword(token, password);
      }
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (err) {
      if (err.status === 400) {
        setError('This link is invalid or has expired. Please request a new one.');
      } else {
        setError('Could not update your password. Please try again.');
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
          <h1 style={{ marginBottom: '0.25rem', fontSize: '1.5rem' }}>{title}</h1>
        </div>

        {done ? (
          <Feedback type="success" message="Your password has been set. Redirecting to sign in..." />
        ) : !token ? (
          <>
            <Feedback type="error" message="Missing or invalid link. Please use the link from your email." />
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <Feedback type="error" message={error} />}
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required
            />
            <Button type="submit" variant="primary" isLoading={submitting} style={{ width: '100%', marginTop: '0.5rem' }}>
              Save password
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
