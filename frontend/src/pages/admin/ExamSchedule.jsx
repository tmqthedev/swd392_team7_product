import { useCallback, useEffect, useState } from 'react';
import { Play, Square, Flame, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../components/ui/Loading';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import {
  listExamSchedule,
  listSubjects,
  startExamSession,
  closeExamSessionAsAdmin,
  warmExamSession,
} from '../../services/adminApi';
import { formatDateTime } from '../../shared/utils/formatDate';

const POLL_INTERVAL_MS = 10000;

const STATUS_OPTIONS = ['SCHEDULED', 'OPEN', 'CLOSED', 'DRAFT'];

// OPEN but past closes_at: no student can start any more, so warming the
// Lambdas is pointless; the admin should close the session.
const windowEnded = (session, now) => session.status === 'OPEN'
  && session.closes_at != null
  && new Date(session.closes_at).getTime() <= now;

const statusBadge = (status) => {
  if (status === 'OPEN') return 'success';
  if (status === 'SCHEDULED') return 'warning';
  if (status === 'CLOSED') return 'neutral';
  return 'info';
};

// A local 'YYYY-MM-DD' date input -> ISO at the start (or end) of that day.
function dayToIso(value, endOfDay) {
  if (!value) return undefined;
  const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const muted = { color: 'var(--text-muted)' };

// STT / TTS warm-up probe: ok -> success with latency, error -> danger with
// the error as a tooltip, absent -> muted dash.
function ProbeBadge({ label, probe }) {
  if (!probe) {
    return <span style={muted} title={`${label}: not warmed yet`}>{label} —</span>;
  }
  const at = probe.at ? ` at ${formatDateTime(probe.at, '')}` : '';
  if (probe.ok) {
    return (
      <Badge type="success" title={`${label} warm${at}`}>
        {label} {probe.ms != null ? `${probe.ms} ms` : 'ok'}
      </Badge>
    );
  }
  return (
    <Badge type="danger" title={`${label} failed${at}: ${probe.error || 'unknown error'}`}>
      {label} error
    </Badge>
  );
}

const AUDIO_BADGE = {
  pending: 'info',
  running: 'warning',
  done: 'success',
  failed: 'danger',
};

function WarmStatus({ warm }) {
  const audio = warm?.audio;
  const keepWarm = warm?.keepWarm;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        <ProbeBadge label="STT" probe={warm?.stt} />
        <ProbeBadge label="TTS" probe={warm?.tts} />
      </div>
      <div style={{ fontSize: '0.8125rem' }}>
        {audio ? (
          <>
            <span>Audio {audio.done ?? 0}/{audio.total ?? 0} </span>
            <Badge type={AUDIO_BADGE[audio.state] || 'info'}>{audio.state}</Badge>
          </>
        ) : (
          <span style={muted}>Audio —</span>
        )}
      </div>
      <div style={{ fontSize: '0.8125rem' }}>
        {keepWarm ? (
          <span title={keepWarm.nextAt ? `Next ping ${formatDateTime(keepWarm.nextAt, '')}` : undefined}>
            Keep-warm{' '}
            <Badge type={keepWarm.state === 'active' ? 'success' : 'neutral'}>{keepWarm.state}</Badge>
          </span>
        ) : (
          <span style={muted}>Keep-warm —</span>
        )}
      </div>
    </div>
  );
}

function actionError(err, fallback) {
  if (err?.code === 'INVALID_TRANSITION') return 'This action is not allowed from the session\'s current status.';
  if (err?.code === 'EXAM_WINDOW_PASSED') return 'The exam window has already passed, so this session cannot be started.';
  return fallback;
}

export default function AdminExamSchedule() {
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  // Time of the last successful load; compared with closes_at to flag OPEN
  // sessions whose window has already ended (students can no longer start).
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const [status, setStatus] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await listExamSchedule({
        status: status || undefined,
        subjectId: subjectId || undefined,
        from: dayToIso(from, false),
        to: dayToIso(to, true),
      });
      setSessions(data.sessions || []);
      setLoadedAt(Date.now());
    } catch {
      if (!silent) setError('Could not load the exam schedule.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [status, subjectId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const data = await listSubjects();
        setSubjects(data.subjects || []);
      } catch {
        // The subject filter is optional; the schedule still loads without it.
      }
    })();
  }, []);

  // Poll while any visible session is OPEN so progress and warm-up stay live.
  const anyOpen = sessions.some((s) => s.status === 'OPEN');
  useEffect(() => {
    if (!anyOpen) return undefined;
    const timer = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [anyOpen, load]);

  const label = (s) => s.title || `Session ${s.exam_session_id}`;

  const runAction = async (session, action, successMessage, fallback) => {
    setNotice('');
    setError('');
    setBusyId(session.exam_session_id);
    try {
      await action(session.exam_session_id);
      setNotice(successMessage);
      await load({ silent: true });
    } catch (err) {
      setError(actionError(err, fallback));
    } finally {
      setBusyId(null);
    }
  };

  const handleStart = (session) => {
    if (!window.confirm(`Start "${label(session)}" now? Students on the roster will be able to begin their viva.`)) return;
    runAction(session, startExamSession, `"${label(session)}" started. Warm-up is running.`, 'Could not start the exam.');
  };

  const handleClose = (session) => {
    if (!window.confirm(`Close "${label(session)}"? Students will no longer be able to start.`)) return;
    runAction(session, closeExamSessionAsAdmin, `"${label(session)}" closed.`, 'Could not close the exam.');
  };

  const handleWarm = (session) => {
    runAction(session, warmExamSession, `Warm-up re-run for "${label(session)}".`, 'Could not warm up the Lambdas.');
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>Exam schedule</h2>
          <p style={{ color: 'var(--text-muted)' }}>Start scheduled exams, close them, and watch Lambda warm-up</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => load()}>
          Refresh
        </Button>
      </div>

      {notice && <Feedback type="success" message={notice} />}
      {error && <Feedback type="error" message={error} />}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="schedule-status">Status</label>
          <select id="schedule-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="schedule-subject">Subject</label>
          <select id="schedule-subject" className="form-select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <Card>
        {loading ? (
          <LoadingSpinner text="Loading exam schedule..." />
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No exam sessions match these filters.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Title</Th>
                <Th>Subject</Th>
                <Th>Lecturer</Th>
                <Th>Window</Th>
                <Th>Status</Th>
                <Th>Students</Th>
                <Th>Progress</Th>
                <Th>Lambda warm-up</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sessions.map((s) => {
                const busy = busyId === s.exam_session_id;
                return (
                  <Tr key={s.exam_session_id}>
                    <Td>{label(s)}</Td>
                    <Td>
                      <div>{s.subject_code || '—'}</div>
                      {s.subject_name && <div style={{ ...muted, fontSize: '0.8125rem' }}>{s.subject_name}</div>}
                    </Td>
                    <Td>
                      <div>{s.creator_name || '—'}</div>
                      {s.creator_email && <div style={{ ...muted, fontSize: '0.8125rem' }}>{s.creator_email}</div>}
                    </Td>
                    <Td>
                      <div>{formatDateTime(s.opens_at, '—')}</div>
                      <div style={{ ...muted, fontSize: '0.8125rem' }}>to {formatDateTime(s.closes_at, '—')}</div>
                    </Td>
                    <Td>
                      <Badge type={statusBadge(s.status)}>{s.status}</Badge>
                      {windowEnded(s, loadedAt) && (
                        <div style={{ marginTop: '0.375rem' }}><Badge type="warning">Window ended</Badge></div>
                      )}
                    </Td>
                    <Td>{s.student_count ?? 0}</Td>
                    <Td>
                      <div>{s.interviews_started ?? 0} started</div>
                      <div style={{ ...muted, fontSize: '0.8125rem' }}>{s.interviews_completed ?? 0} completed</div>
                    </Td>
                    <Td><WarmStatus warm={s.warm_status} /></Td>
                    <Td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {s.status === 'SCHEDULED' && (
                          <Button variant="primary" icon={<Play size={14} />} isLoading={busy} onClick={() => handleStart(s)}>
                            Start
                          </Button>
                        )}
                        {s.status === 'OPEN' && (
                          <>
                            {!windowEnded(s, loadedAt) && (
                              <Button variant="secondary" icon={<Flame size={14} />} isLoading={busy} onClick={() => handleWarm(s)}>
                                Warm again
                              </Button>
                            )}
                            <Button variant="danger" icon={<Square size={14} />} isLoading={busy} onClick={() => handleClose(s)}>
                              Close
                            </Button>
                          </>
                        )}
                        {s.status !== 'SCHEDULED' && s.status !== 'OPEN' && <span style={muted}>—</span>}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
