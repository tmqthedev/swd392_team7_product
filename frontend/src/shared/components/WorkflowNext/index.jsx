import { t, useLocale } from '../../../i18n/index';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { LECTURER_STEPS } from '../../../config/lecturerFlow';
import './index.scss';

// Step bar shown on each lecturer workflow page: where this page sits in the
// flow, a link back, and the next step. When the page reports `done`, the next
// step is highlighted with a short hint so the lecturer moves on.
export default function WorkflowNext({ step, done = false }) {
  useLocale();
  const index = LECTURER_STEPS.findIndex((s) => s.step === step);
  if (index < 0) return null;
  const current = LECTURER_STEPS[index];
  const prev = LECTURER_STEPS[index - 1];
  const next = LECTURER_STEPS[index + 1];

  return (
    <div className={`workflow-next ${done ? 'is-done' : ''}`} role="navigation" aria-label={t("Workflow")}>
      <span className="workflow-next-step">
        {t("Step {v0} of {v1}", { v0: current.step, v1: LECTURER_STEPS.length })}
      </span>
      <span className="workflow-next-hint">
        {done && current.doneHint ? (
          <>
            <CheckCircle2 size={16} aria-hidden="true" />
            {t(current.doneHint)}
          </>
        ) : null}
      </span>
      <span className="workflow-next-links">
        {prev && (
          <Link to={prev.to} className="btn btn-secondary">
            <ArrowLeft size={14} /> {t(prev.label)}
          </Link>
        )}
        {next && (
          <Link to={next.to} className={`btn ${done ? 'btn-primary' : 'btn-secondary'}`}>
            {t("Next: {v0}", { v0: t(next.label) })} <ArrowRight size={14} />
          </Link>
        )}
      </span>
    </div>
  );
}
