import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LottieSvg } from 'lottie-react';
import { useReducedMotion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import loginAnimation from '../../../assets/login.json';
import './index.scss';

const ACCOUNTS = {
  lecturer: { role: 'lecturer', name: 'Dr. Smith' },
  student: { role: 'student', name: 'John Doe' },
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [role, setRole] = useState('lecturer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!identifier.trim()) {
      nextErrors.identifier = 'Enter your email or student ID.';
    }
    if (!password.trim()) {
      nextErrors.password = 'Enter your password.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const account = ACCOUNTS[role];
    login(account.role, account.name);
    navigate(`/${account.role}`);
  };

  return (
    <div className="auth-page">
      <a className="skip-link" href="#sign-in">Skip to sign in</a>

      <aside className="auth-visual">
        <div className="auth-visual-backdrop" aria-hidden="true">
          <span className="auth-visual-plane auth-visual-plane--a" />
          <span className="auth-visual-plane auth-visual-plane--b" />
        </div>

        <div className="auth-brand">
          <p className="auth-kicker">University Examination Platform</p>
          <h1>AIVES</h1>
          <p className="auth-system">AI-Powered Viva Exam System</p>
        </div>

        <div className="auth-visual-animation" aria-hidden="true">
          <LottieSvg
            className="auth-visual-lottie"
            src={loginAnimation}
            loop={!reduceMotion}
            autoplay={!reduceMotion}
          />
        </div>

        <p className="auth-summary">Smart and reliable oral examination for universities.</p>
      </aside>

      <main className="auth-form-panel">
        <div className="auth-form-inner">
          <p className="auth-wordmark">AIVES</p>
          <h2 id="sign-in">Welcome back</h2>
          <p className="auth-lead">Sign in to continue to the examination workspace.</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="role-selector">
              <span id="role-label" className="role-selector-label">Role</span>
              <div className="role-selector-options" role="radiogroup" aria-labelledby="role-label">
                <label className={`role-option${role === 'lecturer' ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="lecturer"
                    checked={role === 'lecturer'}
                    onChange={() => setRole('lecturer')}
                  />
                  <span className="role-option-title">Teacher</span>
                  <span className="role-option-hint">Lecturer</span>
                </label>
                <label className={`role-option${role === 'student' ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="student"
                    checked={role === 'student'}
                    onChange={() => setRole('student')}
                  />
                  <span className="role-option-title">Student</span>
                  <span className="role-option-hint">Student</span>
                </label>
              </div>
            </div>

            <Input
              id="identifier"
              name="identifier"
              label="Email or Student ID"
              autoComplete="username"
              value={identifier}
              error={errors.identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  aria-invalid={errors.password ? 'true' : undefined}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && (
                <div className="form-error" id="password-error">{errors.password}</div>
              )}
            </div>

            <div className="auth-form-meta">
              <Link className="forgot-password" to="/forget-password">Forgot password?</Link>
            </div>

            <Button type="submit" className="auth-submit">Sign in</Button>
          </form>
        </div>
      </main>
    </div>
  );
}
