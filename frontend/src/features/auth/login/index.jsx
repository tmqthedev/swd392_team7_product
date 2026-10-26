import { t, useLocale, LanguageSwitcher, translateMessage } from '../../../i18n/index';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LottieSvg } from 'lottie-react';
import { useReducedMotion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Feedback } from '../../../shared/components/Feedback';
import loginAnimation from '../../../assets/login.json';
import './index.scss';

const roleHome = {
  ADMIN: '/admin',
  LECTURER: '/lecturer',
  STUDENT: '/student',
};

export default function Login() {
  useLocale();
  const { login } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!identifier.trim()) {
      nextErrors.identifier = t("Enter your email or student ID.");
    }
    if (!password.trim()) {
      nextErrors.password = t("Enter your password.");
    }
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const user = await login(identifier.trim(), password);
      if (user) {
        navigate(roleHome[user.role] || '/', { replace: true });
      } else {
        setFormError(t("Unable to resolve your session. Please try again."));
      }
    } catch (error) {
      if (error.status === 423) {
        setFormError(t("Your account is temporarily locked. Please try again later."));
      } else {
        setFormError(t("Invalid email/code or password."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <a className="skip-link" href="#sign-in">{t("Skip to sign in")}</a>

      <aside className="auth-visual">
        <div className="auth-visual-backdrop" aria-hidden="true">
          <span className="auth-visual-plane auth-visual-plane--a" />
          <span className="auth-visual-plane auth-visual-plane--b" />
        </div>

        <div className="auth-brand">
          <p className="auth-kicker">{t("University Examination Platform")}</p>
          <h1>AIVES</h1>
          <p className="auth-system">{t("AI-Powered Viva Exam System")}</p>
        </div>

        <div className="auth-visual-animation" aria-hidden="true">
          <LottieSvg
            className="auth-visual-lottie"
            src={loginAnimation}
            loop={!reduceMotion}
            autoplay={!reduceMotion}
          />
        </div>

        <p className="auth-summary">{t("Smart and reliable oral examination for universities.")}</p>
      </aside>

      <main className="auth-form-panel">
        <div className="auth-form-inner">
          <LanguageSwitcher />
          <p className="auth-wordmark">AIVES</p>
          <h2 id="sign-in">{t("Welcome back")}</h2>
          <p className="auth-lead">{t("Sign in to continue to the examination workspace.")}</p>

          {formError && <Feedback type="error" message={formError} />}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <Input
              id="identifier"
              name="identifier"
              label={t("Email or Student ID")}
              autoComplete="username"
              value={identifier}
              error={errors.identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />

            <div className="form-group">
              <label className="form-label" htmlFor="password">{t("Password")}</label>
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
                  aria-label={showPassword ? t("Hide password") : t("Show password")}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && (
                <div className="form-error" id="password-error">{translateMessage(errors.password)}</div>
              )}
            </div>

            <div className="auth-form-meta">
              <Link className="forgot-password" to="/forgot-password">{t("Forgot password?")}</Link>
            </div>

            <Button type="submit" className="auth-submit" isLoading={submitting}>{t("Sign in")}</Button>
          </form>
        </div>
      </main>
    </div>
  );
}
