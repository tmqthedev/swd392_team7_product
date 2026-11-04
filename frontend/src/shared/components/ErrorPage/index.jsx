import { Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, LogIn, RefreshCw, SearchX, ShieldAlert, ServerCrash, Lock, AlertTriangle, CloudOff } from 'lucide-react';
import { t, useLocale } from '../../../i18n/index';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../Button';
import { ROLE_HOME } from '../../utils/httpStatus';
import './index.scss';

// Copy per HTTP status. Keys are English i18n keys (see vi.json / en.json).
const PAGES = {
  400: { icon: AlertTriangle, title: 'Invalid request', text: 'The link or the data sent is not valid. Check the address and try again.' },
  401: { icon: Lock, title: 'Sign in required', text: 'Your session has ended. Please sign in again to continue.' },
  403: { icon: ShieldAlert, title: 'Access denied', text: 'You do not have permission to view this page. If you think this is a mistake, contact an administrator.' },
  404: { icon: SearchX, title: 'Page not found', text: 'The page or record you are looking for does not exist, was deleted, or the link is wrong.' },
  409: { icon: AlertTriangle, title: 'Conflict', text: 'This record was changed by someone else or is in a state that does not allow this action. Reload and try again.' },
  500: { icon: ServerCrash, title: 'Something went wrong', text: 'An unexpected error occurred. Please try again in a moment.' },
  503: { icon: CloudOff, title: 'Service unavailable', text: 'The service is temporarily unavailable or under maintenance. Please try again later.' },
};

function pageFor(code) {
  if (PAGES[code]) return PAGES[code];
  if (code === 502 || code === 504) return PAGES[503];
  if (code >= 500) return PAGES[500];
  if (code >= 400) return PAGES[400];
  return PAGES[500];
}

/**
 * Full error page for an HTTP status.
 * - `embedded`: rendered inside the app shell (sidebar + topbar) instead of full screen.
 * - `onRetry`: shows a "Try again" button (useful for 5xx and render errors).
 * - `backTo` / `backLabel`: an extra "back" link (e.g. back to a list page).
 * - `message`: optional extra detail shown under the description.
 */
export function ErrorPage({ code = 404, embedded = false, onRetry, backTo, backLabel, message }) {
  useLocale();
  const navigate = useNavigate();
  const { user } = useAuth();
  const page = pageFor(code);
  const Icon = page.icon;
  const home = user ? (ROLE_HOME[user.role] || '/') : '/';

  return (
    <div className={`error-page ${embedded ? 'error-page--embedded' : 'error-page--full'}`} role="alert">
      <div className="error-page__card">
        <div className={`error-page__icon error-page__icon--${code >= 500 ? 'server' : 'client'}`}>
          <Icon size={34} aria-hidden="true" />
        </div>
        <div className="error-page__code" aria-hidden="true">{code}</div>
        <h1 className="error-page__title">{t(page.title)}</h1>
        <p className="error-page__text">{t(page.text)}</p>
        {message && <p className="error-page__detail">{message}</p>}

        <div className="error-page__actions">
          {onRetry && (
            <Button variant="primary" icon={<RefreshCw size={16} />} onClick={onRetry}>{t('Try again')}</Button>
          )}
          {backTo && (
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(backTo)}>{backLabel || t('Go back')}</Button>
          )}
          {!backTo && code !== 401 && (
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>{t('Go back')}</Button>
          )}
          {code === 401 || !user ? (
            <Button variant={onRetry ? 'secondary' : 'primary'} icon={<LogIn size={16} />} onClick={() => navigate('/', { replace: true })}>{t('Go to sign in')}</Button>
          ) : (
            <Button variant={onRetry ? 'secondary' : 'primary'} icon={<Home size={16} />} onClick={() => navigate(home)}>{t('Go to home page')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Catches render errors so one broken page does not blank the whole app.
 * Pass `resetKey` (e.g. the pathname) so navigating away clears the error.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorPage
          code={500}
          embedded={this.props.embedded}
          onRetry={() => this.setState({ error: null })}
          message={import.meta.env.DEV ? String(this.state.error?.message || this.state.error) : undefined}
        />
      );
    }
    return this.props.children;
  }
}
