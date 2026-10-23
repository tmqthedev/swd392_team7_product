import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCw, CheckCircle, Clock, BookOpen, Mic, AlertCircle, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/Loading';
import { Feedback } from '../../components/ui/Feedback';
import { listMyExamSessions, startOrResumeInterview } from '../../services/studentExamApi';
import { formatDateTime } from '../../shared/utils/formatDate';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startingId, setStartingId] = useState(null);
  // Captured when the list loads, so render stays pure.
  const [now, setNow] = useState(() => Date.now());

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listMyExamSessions();
      setSessions(Array.isArray(data) ? data : []);
      setNow(Date.now());
    } catch (err) {
      setError(err.message || 'Could not load your exam sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleStartOrResume = async (session) => {
    try {
      setStartingId(session.examSessionId);
      setError(null);
      const result = await startOrResumeInterview(session.examSessionId);
      navigate(`/student/viva?interviewId=${result.interviewId}`);
    } catch (err) {
      setError(err.message || 'Failed to start interview.');
      setStartingId(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          My Oral Examination Sessions
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Assigned AI viva examinations for your enrolled subjects
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Feedback type="error" message={error} onClose={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner size={36} text="Loading assigned exam sessions..." />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardBody style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary-light, #e0e7ff)', color: 'var(--primary, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
              <BookOpen size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>No exams assigned</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
              You do not have any oral examination sessions scheduled at this time. Please contact your lecturer if you believe this is an error.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {sessions.map((session) => {
            const isCompleted = session.interview && session.interview.status === 'COMPLETED';
            const isInProgress = session.interview && session.interview.status === 'IN_PROGRESS';
            const isStarting = startingId === session.examSessionId;
            const opensAt = session.opensAt ?? session.opens_at ?? null;
            const closesAt = session.closesAt ?? session.closes_at ?? null;
            const notStartedYet = !isCompleted && !session.canResume
              && opensAt != null && new Date(opensAt).getTime() > now;
            const windowClosed = !isCompleted && !session.canResume
              && closesAt != null && new Date(closesAt).getTime() <= now;

            return (
              <motion.div
                key={session.examSessionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card style={{ borderLeft: session.canResume ? '4px solid #f59e0b' : session.canStart ? '4px solid #10b981' : isCompleted ? '4px solid #6366f1' : '4px solid var(--border)' }}>
                  <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: '700', color: 'var(--primary, #4f46e5)' }}>
                          {session.subjectCode || 'N/A'}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>•</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          {session.subjectName}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.3rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                        {session.title}
                      </h3>
                      {session.topicName && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          Topic: <span style={{ fontWeight: '500', color: 'var(--text)' }}>{session.topicName}</span>
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Badge type={session.language === 'VI' ? 'info' : 'neutral'}>
                        {session.language === 'VI' ? 'Tiếng Việt' : 'English'}
                      </Badge>

                      {isCompleted ? (
                        <Badge type="success">Completed</Badge>
                      ) : session.canResume ? (
                        <Badge type="warning">In Progress</Badge>
                      ) : session.canStart ? (
                        <Badge type="success">Available Now</Badge>
                      ) : notStartedYet ? (
                        <Badge type="info">Not started yet</Badge>
                      ) : session.status === 'CLOSED' ? (
                        <Badge type="danger">Closed</Badge>
                      ) : (
                        <Badge type="neutral">{session.status}</Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardBody>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem', background: 'var(--bg-subtle, rgba(0,0,0,0.02))', padding: '1rem', borderRadius: 'var(--radius-md, 8px)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Clock size={18} style={{ color: 'var(--text-muted)' }} />
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time Limit</div>
                          <div style={{ fontWeight: '600' }}>{Math.round((session.sessionTimeLimitSec || 1800) / 60)} minutes</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Mic size={18} style={{ color: 'var(--text-muted)' }} />
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Questions</div>
                          <div style={{ fontWeight: '600' }}>
                            {session.mainQuestionCount} main questions ({session.maxFollowUpsPerQuestion} follow-ups max)
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Calendar size={18} style={{ color: 'var(--text-muted)' }} />
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Opens At</div>
                          <div style={{ fontWeight: '600' }}>{formatDateTime(opensAt)}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Calendar size={18} style={{ color: 'var(--text-muted)' }} />
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Available Until</div>
                          <div style={{ fontWeight: '600' }}>{formatDateTime(closesAt)}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
                      {session.canStart && (
                        <Button
                          variant="primary"
                          onClick={() => handleStartOrResume(session)}
                          disabled={isStarting}
                        >
                          <Play size={18} />
                          {isStarting ? 'Starting...' : 'Start Examination'}
                        </Button>
                      )}

                      {session.canResume && (
                        <Button
                          variant="warning"
                          onClick={() => handleStartOrResume(session)}
                          disabled={isStarting}
                        >
                          <RotateCw size={18} />
                          {isStarting ? 'Resuming...' : 'Resume Examination'}
                        </Button>
                      )}

                      {isCompleted && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: '500' }}>
                          <CheckCircle size={18} />
                          <span>Interview submitted for grading</span>
                        </div>
                      )}

                      {notStartedYet && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                          <Clock size={18} />
                          <span>Not started yet. The exam opens at {formatDateTime(opensAt)}.</span>
                        </div>
                      )}

                      {windowClosed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                          <AlertCircle size={18} />
                          <span>This exam closed at {formatDateTime(closesAt)}. Contact your lecturer if you missed it.</span>
                        </div>
                      )}

                      {!session.canStart && !session.canResume && !isCompleted && !notStartedYet && !windowClosed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                          <AlertCircle size={18} />
                          <span>Examination is currently unavailable</span>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
