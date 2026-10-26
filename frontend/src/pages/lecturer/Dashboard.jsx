import { t, useLocale } from '../../i18n/index';
import { BookOpen, CheckSquare, Users } from 'lucide-react';

export default function LecturerDashboard() {
  useLocale();
  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2>{t("Lecturer Dashboard")}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t("Overview of your AIVES examinations")}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ background: 'var(--primary-light)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}>
            <BookOpen size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>24</h3>
            <p style={{ color: 'var(--text-muted)' }}>{t("Total Questions")}</p>
          </div>
        </div>
        
        <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--secondary)' }}>
            <CheckSquare size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>12</h3>
            <p style={{ color: 'var(--text-muted)' }}>{t("Rubrics Defined")}</p>
          </div>
        </div>

        <div className="card glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--accent)' }}>
            <Users size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>156</h3>
            <p style={{ color: 'var(--text-muted)' }}>{t("Evaluations Pending")}</p>
          </div>
        </div>
      </div>
      
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>{t("Recent Activities")}</h3>
        <p style={{ color: 'var(--text-muted)' }}>{t("No recent activities found.")}</p>
      </div>
    </div>
  );
}
