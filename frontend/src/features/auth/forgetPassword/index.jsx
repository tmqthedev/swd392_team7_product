import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { Feedback } from '../../../shared/components/Feedback';
import { Input } from '../../../shared/components/Input';
import './index.scss';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgetPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const value = email.trim();

    if (!value) {
      setStatus('error');
      setMessage('Enter your email address.');
      return;
    }

    if (!EMAIL_PATTERN.test(value)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }

    // No forgot-password endpoint exists in this project.
    // Do not report success for a request that was never sent.
    setStatus('error');
    setMessage('A reset link cannot be sent because no password reset service is connected.');
  };

  return (
    <div className="forgot-password-page">
      <a className="skip-link" href="#reset-password">Skip to password reset</a>

      <div className="forgot-password-layout">
        <aside className="auth-visual">
          <div className="auth-brand">
            <img className="auth-mark" src="/favicon.svg" alt="" width="40" height="40" />
            <p className="auth-kicker">University examination</p>
            <h1>AIVES</h1>
            <p className="auth-system">AI-Powered Viva Exam System</p>
            <p className="auth-summary">
              Smart and reliable oral examination platform for universities.
            </p>
          </div>
        </aside>

        <main className="forgot-password-card" id="reset-password">
          <div className="auth-card-brand">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>AIVES</span>
          </div>

          {status === 'success' ? (
            <div className="forgot-password-success">
              <h2>Check your email</h2>
              <Feedback
                type="success"
                message="If an account exists for that address, password reset instructions will be sent there."
              />
              <Link className="forgot-password-back" to="/">Back to login</Link>
            </div>
          ) : (
            <>
              <h2>Forgot your password?</h2>
              <p className="auth-lead">
                Enter your email address and we&apos;ll help you reset your password.
              </p>

              <form className="forgot-password-form" onSubmit={handleSubmit} noValidate>
                {status === 'error' && <Feedback type="error" message={message} />}

                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  label="Email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                />

                <div className="forgot-password-actions">
                  <Button
                    type="submit"
                    className="auth-submit"
                    isLoading={status === 'loading'}
                    aria-label={status === 'loading' ? 'Sending reset link' : undefined}
                  >
                    Send reset link
                  </Button>
                  <Link className="forgot-password-back" to="/">Back to login</Link>
                </div>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
