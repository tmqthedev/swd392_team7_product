import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Feedback } from '../components/ui/Feedback';
import { postForgotPassword } from '../services/authApi';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await postForgotPassword(identifier.trim());
    } catch {
      // The endpoint is enumeration-safe; still show the same confirmation.
    } finally {
      setSubmitting(false);
      setDone(true);
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
          <h1 style={{ marginBottom: '0.25rem', fontSize: '1.5rem' }}>Reset your password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Enter your email or code and we will send you a reset link.
          </p>
        </div>

        {done ? (
          <>
            <Feedback
              type="success"
              message="If an account matches, a reset link has been sent. Please check your email."
            />
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <Input
              label="Email or code"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com or your code"
              required
            />
            <Button type="submit" variant="primary" isLoading={submitting} style={{ width: '100%', marginTop: '0.5rem' }}>
              Send reset link
            </Button>
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <Link to="/" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
