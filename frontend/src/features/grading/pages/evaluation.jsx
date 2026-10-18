import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { Card, CardHeader, CardBody } from '../../../shared/components/Card';
import { Badge } from '../../../shared/components/Badge';
import { Textarea } from '../../../shared/components/Input';
import { Feedback } from '../../../shared/components/Feedback';
import { LoadingSpinner } from '../../../shared/components/Loading';
import { FLUENCY, SLOT_STATUS, TURN_TYPE } from '../../../constants/enums';
import { finalizeEvaluation, getEvaluation, saveLecturerScores } from '../services/gradingService';
import './evaluation.scss';

const FLUENCY_LABEL = {
  [FLUENCY.HESITANT]: 'Hesitant',
  [FLUENCY.ADEQUATE]: 'Adequate',
  [FLUENCY.FLUENT]: 'Fluent',
};

export default function LecturerEvaluationReview() {
  const { id } = useParams();
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('reviewing');
  const [draftScores, setDraftScores] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEvaluation(id)
      .then((data) => {
        if (cancelled) return;
        setEvaluation(data);
        setDraftScores(data.criteriaScores.map((item) => ({
          criterionId: item.criterionId,
          lecturerScore: item.lecturerScore ?? item.aiScore,
        })));
        setReason(data.lecturerReason || '');
        setMode(data.status === SLOT_STATUS.APPROVED ? 'approved' : 'reviewing');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="evaluation-page">
        <LoadingSpinner text="Loading evaluation..." />
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="evaluation-page">
        <Feedback type="error" title="Evaluation not found" message={error || 'This session has no grading record.'} />
      </div>
    );
  }

  const maxTotal = evaluation.criteriaScores.reduce((sum, item) => sum + item.maxScore, 0);
  const lecturerTotal = evaluation.lecturerOverall;
  const isApproved = evaluation.status === SLOT_STATUS.APPROVED;

  const startAdjust = () => {
    setDraftScores(evaluation.criteriaScores.map((item) => ({
      criterionId: item.criterionId,
      lecturerScore: item.lecturerScore ?? item.aiScore,
    })));
    setReason(evaluation.lecturerReason || '');
    setError('');
    setMode('editing');
  };

  const saveAdjust = async () => {
    setSaving(true);
    setError('');
    try {
      const next = await saveLecturerScores(id, { criteriaScores: draftScores, lecturerReason: reason });
      setEvaluation(next);
      setMode('reviewing');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const approveAi = async () => {
    setSaving(true);
    setError('');
    try {
      const next = await finalizeEvaluation(id, { useAiScores: true });
      setEvaluation(next);
      setMode('approved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const finalizeAdjusted = async () => {
    setSaving(true);
    setError('');
    try {
      const next = await finalizeEvaluation(id, { useAiScores: false });
      setEvaluation(next);
      setMode('approved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="evaluation-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Evaluation review</p>
          <h1>{evaluation.name}</h1>
          <p>{evaluation.exam}</p>
        </div>
        {isApproved ? <Badge type="success">Finalized</Badge> : <Badge type="warning">Pending Review</Badge>}
      </header>

      {error && <Feedback type="error" message={error} />}

      <dl className="exam-summary">
        <div>
          <dt>Student ID</dt>
          <dd>{evaluation.studentId}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{id}</dd>
        </div>
        <div>
          <dt>Turns</dt>
          <dd>{evaluation.turns.length}</dd>
        </div>
        <div>
          <dt>Avg. answer time</dt>
          <dd>{evaluation.signals.avgAnswerSeconds}s</dd>
        </div>
        <div>
          <dt>Fluency</dt>
          <dd>{FLUENCY_LABEL[evaluation.signals.fluency] || evaluation.signals.fluency}</dd>
        </div>
      </dl>

      <div className="evaluation-layout">
        <section>
          <h2 className="section-title">Transcript</h2>
          <div className="transcript-list">
            {evaluation.turns.map((item) => (
              <article key={item.turnId} className={`turn-block${item.type === TURN_TYPE.FOLLOW_UP ? ' is-follow-up' : ''}`}>
                <p className="turn-label">
                  {item.type === TURN_TYPE.FOLLOW_UP ? `Follow-up ${item.turn}` : `Question ${item.turn}`}
                  {item.durationSeconds ? ` · ${item.durationSeconds}s` : ''}
                </p>
                <h3>Question</h3>
                <p>{item.q}</p>
                {item.reason && (
                  <>
                    <h3>Follow-up reason</h3>
                    <p>{item.reason}</p>
                  </>
                )}
                <h3>Student answer</h3>
                <p>{item.a}</p>
                {item.audioUrl && (
                  <div className="audio-row">
                    <span>Answer recording</span>
                    <audio controls src={item.audioUrl}>
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title">Lecturer review</h2>
          {isApproved && (
            <Feedback type="success" title="Evaluation finalized" message={`Final score: ${evaluation.lecturerOverall}/${maxTotal}. AI had suggested ${evaluation.aiOverall}/${maxTotal}.`} />
          )}

          <div className="score-pair">
            <div className="score-chip score-chip-ai">
              <span>AI suggested</span>
              <strong>{evaluation.aiOverall}</strong>
              <small>/ {maxTotal}</small>
            </div>
            <div className="score-chip score-chip-lecturer">
              <span>Lecturer final</span>
              <strong>{lecturerTotal == null ? '—' : lecturerTotal}</strong>
              <small>/ {maxTotal}</small>
            </div>
          </div>

          <Card className="is-flush assessment-card">
            <CardHeader>
              <h3>{mode === 'editing' ? 'Adjust criterion scores' : 'Scores by rubric criterion'}</h3>
            </CardHeader>
            <CardBody>
              <table className="criteria-score-table">
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>AI</th>
                    <th>Lecturer</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.criteriaScores.map((item) => {
                    const draft = draftScores.find((row) => row.criterionId === item.criterionId);
                    return (
                      <tr key={item.criterionId}>
                        <td>
                          <strong>{item.name}</strong>
                          <div className="table-meta">{item.evidence}</div>
                        </td>
                        <td>{item.aiScore}</td>
                        <td>
                          {mode === 'editing' ? (
                            <input
                              className="form-input criteria-input"
                              type="number"
                              min="0"
                              max={item.maxScore}
                              step="0.5"
                              value={draft?.lecturerScore ?? ''}
                              onChange={(event) =>
                                setDraftScores((current) =>
                                  current.map((row) =>
                                    row.criterionId === item.criterionId
                                      ? { ...row, lecturerScore: Number(event.target.value) }
                                      : row
                                  )
                                )
                              }
                              aria-label={`Lecturer score for ${item.name}`}
                            />
                          ) : (
                            item.lecturerScore ?? '—'
                          )}
                        </td>
                        <td>{item.maxScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <h3 className="assessment-label">Strengths</h3>
              <ul className="note-list">{evaluation.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
              <h3 className="assessment-label">Weaknesses</h3>
              <ul className="note-list">{evaluation.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
              <h3 className="assessment-label">Missing points</h3>
              {evaluation.missingPoints.length === 0 ? (
                <p className="table-meta">None recorded.</p>
              ) : (
                <ul className="note-list">{evaluation.missingPoints.map((item) => <li key={item}>{item}</li>)}</ul>
              )}

              {mode === 'editing' && (
                <Textarea
                  id="lecturer-reason"
                  label="Reason for changing the AI suggestion"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}

              {evaluation.lecturerReason && mode !== 'editing' && (
                <>
                  <h3 className="assessment-label">Lecturer reason</h3>
                  <p className="explanation">{evaluation.lecturerReason}</p>
                </>
              )}
            </CardBody>

            {mode === 'reviewing' && !isApproved && (
              <div className="review-actions review-actions-footer">
                <Button variant="secondary" onClick={startAdjust}>Adjust scores</Button>
                {lecturerTotal != null && (
                  <Button variant="secondary" onClick={finalizeAdjusted} isLoading={saving}>
                    Finalize lecturer score
                  </Button>
                )}
                <Button onClick={approveAi} isLoading={saving}>Approve AI score</Button>
              </div>
            )}

            {mode === 'editing' && (
              <div className="review-actions review-actions-footer">
                <Button variant="secondary" onClick={() => setMode('reviewing')}>Cancel</Button>
                <Button onClick={saveAdjust} isLoading={saving}>Save adjustment</Button>
              </div>
            )}

            {isApproved && (
              <div className="review-actions review-actions-footer">
                <Button variant="secondary" onClick={startAdjust}>Edit final result</Button>
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
