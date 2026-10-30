import { t, useLocale, translateMessage } from '../../i18n/index';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../shared/components/Loading';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { getLecturerProgress } from '../../services/examSessionApi';
import { LECTURER_STEPS } from '../../config/lecturerFlow';

// One column per workflow step (config/lecturerFlow.js); `count` picks the
// number from the progress row and `done` decides whether the step is
// complete for that subject.
const COLUMNS = [
  { step: 1, count: (p) => p.topics, done: (p) => p.topics > 0 },
  { step: 2, count: (p) => p.readyMaterials, done: (p) => p.readyMaterials > 0 },
  { step: 3, count: (p) => p.rubrics, done: (p) => p.rubrics > 0 },
  { step: 4, count: (p) => p.approvedQuestions + p.pendingQuestions, done: (p) => p.approvedQuestions + p.pendingQuestions > 0 },
  { step: 5, count: (p) => p.pendingQuestions, done: (p) => p.approvedQuestions > 0 && p.pendingQuestions === 0 },
  { step: 6, count: (p) => p.scheduledExams, done: (p) => p.scheduledExams > 0 },
  { step: 7, count: (p) => p.resultsToReview, done: (p) => p.scheduledExams > 0 && p.resultsToReview === 0 },
];

const stepOf = (n) => LECTURER_STEPS.find((s) => s.step === n);

// Per-subject progress through the lecturer workflow, with the next step to
// do highlighted and linked. Real counts only (no placeholder numbers).
export default function LecturerDashboard() {
  useLocale();
  const [subjects, setSubjects] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await getLecturerProgress();
        setSubjects(data.subjects || []);
      } catch (err) {
        setError(err.message || t("Could not load your progress."));
        setSubjects([]);
      }
    })();
  }, []);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2>{t("Lecturer Dashboard")}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t("Your progress per subject. Finish steps 1-5 to complete the question bank, then set up and grade exams.")}</p>
      </div>

      {error && <Feedback type="error" message={translateMessage(error)} />}

      <div className="card">
        {subjects === null ? (
          <LoadingSpinner text={t("Loading...")} />
        ) : subjects.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t("You are not assigned to any subject yet. Ask an admin to assign you.")}</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{t("Subject")}</Th>
                {COLUMNS.map((c) => (
                  <Th key={c.step}>{c.step}. {t(stepOf(c.step).label)}</Th>
                ))}
                <Th>{t("Next step")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {subjects.map((p) => {
                const next = COLUMNS.find((c) => !c.done(p));
                return (
                  <Tr key={p.subjectId}>
                    <Td><strong>{p.code}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{p.name}</div></Td>
                    {COLUMNS.map((c) => (
                      <Td
                        key={c.step}
                        style={{
                          color: c.done(p) ? 'var(--success, #1c5c4a)' : undefined,
                          fontWeight: next && next.step === c.step ? 700 : 400,
                        }}
                      >
                        {c.done(p) ? '✓ ' : ''}{c.count(p)}
                      </Td>
                    ))}
                    <Td>
                      {next ? (
                        <Link to={stepOf(next.step).to} className="btn btn-primary">{next.step}. {t(stepOf(next.step).label)}</Link>
                      ) : (
                        <span style={{ color: 'var(--success, #1c5c4a)' }}>{t("All steps done")}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
