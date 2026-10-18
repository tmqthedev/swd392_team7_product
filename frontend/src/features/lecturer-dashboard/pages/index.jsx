import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../shared/components/Button';
import { Badge } from '../../../shared/components/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../../shared/components/Table';
import { Card } from '../../../shared/components/Card';
import { Feedback } from '../../../shared/components/Feedback';
import { SLOT_STATUS } from '../../../constants/enums';
import { countQuestions } from '../../question-bank/services/questionService';
import { getSessionStats, listSessions } from '../../grading/services/sessionService';
import { formatSessionDate } from '../../../shared/utils/formatDate';
import './index.scss';

function statusLabel(status) {
  return status === SLOT_STATUS.APPROVED ? 'Approved' : 'Pending Review';
}

export default function LecturerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, exams: 0 });
  const [questionCount, setQuestionCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSessions(), getSessionStats(), countQuestions()])
      .then(([rows, nextStats, questions]) => {
        if (cancelled) return;
        setSessions(rows);
        setStats(nextStats);
        setQuestionCount(questions);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingSessions = sessions.filter((session) => session.status === SLOT_STATUS.PENDING_REVIEW);

  return (
    <div className="lecturer-dashboard">
      <header className="page-header">
        <div>
          <p className="page-kicker">Lecturer workspace</p>
          <h1>Dashboard</h1>
          <p>
            Welcome back{user?.name ? `, ${user.name}` : ''}. Sessions waiting for confirmation are listed first.
          </p>
        </div>
      </header>

      {error && <Feedback type="error" message={error} />}

      <section className="stats-strip" aria-label="Examination statistics">
        <article>
          <span>Active exams</span>
          <strong>{stats.exams}</strong>
        </article>
        <article>
          <span>Question bank</span>
          <strong>{questionCount}</strong>
        </article>
        <article>
          <span>Pending evaluations</span>
          <strong>{stats.pending}</strong>
        </article>
        <article>
          <span>Completed sessions</span>
          <strong>{stats.approved}</strong>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-section">
          <div className="section-heading">
            <h2>Recent viva sessions</h2>
            <Link to="/lecturer/sessions">All sessions</Link>
          </div>
          <Card className="is-flush">
            <Table>
              <Thead>
                <Tr>
                  <Th>Student</Th>
                  <Th>Course / topic</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th className="cell-actions">Action</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sessions.map((session) => (
                  <Tr key={session.id}>
                    <Td>
                      <div className="table-student">{session.studentName}</div>
                      <div className="table-meta">{session.studentId}</div>
                    </Td>
                    <Td>{session.exam}</Td>
                    <Td>{formatSessionDate(session.date)}</Td>
                    <Td>
                      <Badge type={session.status === SLOT_STATUS.APPROVED ? 'success' : 'warning'}>
                        {statusLabel(session.status)}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="num">{session.lecturerScore ?? session.aiScore}</span>
                      <span className="table-meta"> / 10</span>
                    </Td>
                    <Td className="cell-actions">
                      <Button variant="secondary" onClick={() => navigate(`/lecturer/evaluation/${session.id}`)}>
                        Review
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <h2>Awaiting review</h2>
          </div>
          <Card>
            {pendingSessions.length === 0 ? (
              <p className="table-meta">No sessions are waiting for confirmation.</p>
            ) : (
              <ul className="review-queue">
                {pendingSessions.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{session.studentName}</strong>
                      <span>{session.exam}</span>
                    </div>
                    <Link to={`/lecturer/evaluation/${session.id}`}>Review</Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="overview-note">
              {stats.approved === 1 ? '1 session has been approved.' : `${stats.approved} sessions have been approved.`}
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
