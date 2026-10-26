import { t, useLocale, translateMessage } from '../i18n/index';
import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Feedback } from '../components/ui/Feedback';
import { putChangePassword } from '../services/authApi';

export default function ChangePassword() {
  useLocale();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword.length < 8) {
      setError(t("New password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirm) {
      setError(t("New passwords do not match."));
      return;
    }

    setSubmitting(true);
    try {
      await putChangePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      if (err.status === 401 || err.status === 400) {
        setError(t("Your current password is incorrect."));
      } else {
        setError(t("Could not change your password. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2>{t("Change password")}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t("Update the password for your account")}</p>
      </div>

      <Card style={{ maxWidth: '480px' }}>
        {success && <Feedback type="success" message={t("Your password has been updated.")} />}
        {error && <Feedback type="error" message={translateMessage(error)} />}
        <form onSubmit={handleSubmit}>
          <Input
            label={t("Current password")}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label={t("New password")}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("At least 8 characters")}
            autoComplete="new-password"
            required
          />
          <Input
            label={t("Confirm new password")}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Button type="submit" variant="primary" isLoading={submitting} style={{ marginTop: '0.5rem' }}>{t("Update password")}</Button>
        </form>
      </Card>
    </div>
  );
}
