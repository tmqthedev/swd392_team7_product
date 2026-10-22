import { useState, useEffect, useCallback } from 'react';
import { Plus, Send, Undo2, Square, Pencil, Users as UsersIcon } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Feedback } from '../../components/ui/Feedback';
import {
  listExamSessions,
  getExamSession,
  createExamSession,
  updateExamSession,
  setExamStudents,
  setExamExaminers,
  scheduleExamSession,
  unscheduleExamSession,
  closeExamSession,
  listTopics,
} from '../../services/examSessionApi';
import { formatDateTime, toDateTimeLocal, fromDateTimeLocal } from '../../shared/utils/formatDate';

const BLOOM_LEVELS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'];
const BLOOM_LABELS = {
  REMEMBER: 'Remember',
  UNDERSTAND: 'Understand',
  APPLY: 'Apply',
  ANALYZE: 'Analyze',
};

const EMPTY_BLOOM = { REMEMBER: '', UNDERSTAND: '', APPLY: '', ANALYZE: '' };

// Nhom-3 config defaults, mirrored from the backend's createSession defaults.
const DEFAULT_CONFIG = {
  main_question_count: 3,
  max_follow_ups_per_question: 2,
  answer_time_limit_sec: 120,
  think_time_sec: 0,
  // Total interview time, entered in minutes and sent as seconds (backend
  // default 1800 s, range 60-14400 s).
  session_time_limit_min: 30,
  // Exam window as local datetime-local values; optional for a draft but
  // required before the session can be submitted for scheduling.
  opens_at: '',
  closes_at: '',
  // Blank = no limit on follow-ups across the whole interview.
  max_follow_ups_total: '',
  // All blank = the backend balances Bloom levels automatically.
  bloom: EMPTY_BLOOM,
};

const STATUS_BADGE = {
  DRAFT: 'info',
  SCHEDULED: 'warning',
  OPEN: 'success',
  CLOSED: 'neutral',
};

// Parse a numeric id list pasted as text (newlines/commas), dropping blanks
// and non-numeric tokens.
function parseLecturerIds(text) {
  return text
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map((t) => Number(t))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function bloomIsBlank(bloom) {
  return BLOOM_LEVELS.every((level) => String(bloom[level] ?? '').trim() === '');
}

function bloomSum(bloom) {
  return BLOOM_LEVELS.reduce((sum, level) => sum + (Number(bloom[level]) || 0), 0);
}

// Map an exam session row back into the form's config shape (for editing).
function sessionToConfig(session) {
  const dist = session.bloom_distribution;
  return {
    main_question_count: session.main_question_count ?? DEFAULT_CONFIG.main_question_count,
    max_follow_ups_per_question: session.max_follow_ups_per_question ?? DEFAULT_CONFIG.max_follow_ups_per_question,
    answer_time_limit_sec: session.answer_time_limit_sec ?? DEFAULT_CONFIG.answer_time_limit_sec,
    think_time_sec: session.think_time_sec ?? DEFAULT_CONFIG.think_time_sec,
    session_time_limit_min: session.session_time_limit_sec != null
      ? Math.round(session.session_time_limit_sec / 60)
      : DEFAULT_CONFIG.session_time_limit_min,
    opens_at: toDateTimeLocal(session.opens_at),
    closes_at: toDateTimeLocal(session.closes_at),
    max_follow_ups_total: session.max_follow_ups_total ?? '',
    bloom: dist
      ? Object.fromEntries(BLOOM_LEVELS.map((level) => [level, dist[level] ?? 0]))
      : EMPTY_BLOOM,
  };
}

// Validate the config locally; returns an error message or ''.
function validateConfig(config) {
  if (config.opens_at && config.closes_at
    && new Date(config.opens_at).getTime() >= new Date(config.closes_at).getTime()) {
    return '"Closes at" must be after "Opens at".';
  }
  if (!bloomIsBlank(config.bloom) && bloomSum(config.bloom) !== Number(config.main_question_count)) {
    return `The Bloom mix must add up to ${config.main_question_count} main questions (currently ${bloomSum(config.bloom)}).`;
  }
  return '';
}

// Build the snake_case config fields shared by create and update.
function configToPayload(config) {
  const followUpsTotal = String(config.max_follow_ups_total ?? '').trim();
  return {
    main_question_count: Number(config.main_question_count),
    max_follow_ups_per_question: Number(config.max_follow_ups_per_question),
    answer_time_limit_sec: Number(config.answer_time_limit_sec),
    think_time_sec: Number(config.think_time_sec),
    session_time_limit_sec: Number(config.session_time_limit_min) * 60,
    opens_at: fromDateTimeLocal(config.opens_at),
    closes_at: fromDateTimeLocal(config.closes_at),
    max_follow_ups_total: followUpsTotal === '' ? null : Number(followUpsTotal),
    bloom_distribution: bloomIsBlank(config.bloom)
      ? null
      : Object.fromEntries(BLOOM_LEVELS.map((level) => [level, Number(config.bloom[level]) || 0])),
  };
}

// Render the NOT_ENOUGH_QUESTIONS details ({ required, available, byLevel }).
// byLevel entries may be plain counts or { required, available } objects.
function describeShortage(details) {
  if (!details) return '';
  const parts = [];
  if (details.required != null && details.available != null) {
    parts.push(`${details.available} of ${details.required} approved questions available`);
  }
  if (details.byLevel && typeof details.byLevel === 'object') {
    const levels = Object.entries(details.byLevel).map(([level, value]) => {
      const label = BLOOM_LABELS[level] || level;
      if (value && typeof value === 'object') {
        return `${label}: ${value.available ?? 0}/${value.required ?? 0}`;
      }
      return `${label}: ${value}`;
    });
    if (levels.length > 0) parts.push(`by level: ${levels.join(', ')}`);
  }
  return parts.join('; ');
}

function friendlyError(err, fallback) {
  switch (err?.code) {
    case 'NOT_ENOUGH_QUESTIONS': {
      const detail = describeShortage(err.details);
      return `Not enough approved questions in the topic for this configuration${detail ? ` (${detail})` : ''}.`;
    }
    case 'EXAM_WINDOW_PASSED':
      return 'The exam window has already passed. Edit the window and submit again.';
    case 'INVALID_TRANSITION':
      return 'This action is not allowed from the session\'s current status.';
    case 'FORBIDDEN':
      return 'You do not have access to this subject.';
    case 'VALIDATION_ERROR':
      return err.message
        ? `Please check the session settings: ${err.message}`
        : 'Please check the session settings.';
    default:
      return fallback;
  }
}

function formatBloom(dist) {
  if (!dist) return 'Balanced';
  return BLOOM_LEVELS.map((level) => `${BLOOM_LABELS[level]} ${dist[level] ?? 0}`).join(', ');
}

// Config inputs shared by the create and edit forms.
function SessionConfigFields({ config, onChange }) {
  const blank = bloomIsBlank(config.bloom);
  const sum = bloomSum(config.bloom);
  const sumOk = blank || sum === Number(config.main_question_count);

  const setBloom = (level, value) => onChange('bloom', { ...config.bloom, [level]: value });

  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Input
          label="Opens at"
          type="datetime-local"
          value={config.opens_at}
          onChange={(e) => onChange('opens_at', e.target.value)}
        />
        <Input
          label="Closes at"
          type="datetime-local"
          value={config.closes_at}
          onChange={(e) => onChange('closes_at', e.target.value)}
        />
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0 }}>
        The exam window is optional for a draft but required before you submit the schedule.
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Input
          label="Main questions"
          type="number"
          min={1}
          max={10}
          value={config.main_question_count}
          onChange={(e) => onChange('main_question_count', e.target.value)}
        />
        <Input
          label="Max follow-ups / question"
          type="number"
          min={0}
          max={5}
          value={config.max_follow_ups_per_question}
          onChange={(e) => onChange('max_follow_ups_per_question', e.target.value)}
        />
        <Input
          label="Max follow-ups per candidate"
          type="number"
          min={0}
          max={20}
          value={config.max_follow_ups_total}
          placeholder="No limit"
          onChange={(e) => onChange('max_follow_ups_total', e.target.value)}
        />
        <Input
          label="Answer time limit (sec)"
          type="number"
          min={10}
          max={600}
          value={config.answer_time_limit_sec}
          onChange={(e) => onChange('answer_time_limit_sec', e.target.value)}
        />
        <Input
          label="Think time (sec)"
          type="number"
          min={0}
          max={300}
          value={config.think_time_sec}
          onChange={(e) => onChange('think_time_sec', e.target.value)}
        />
        <Input
          label="Session time limit (min)"
          type="number"
          min={1}
          max={240}
          value={config.session_time_limit_min}
          onChange={(e) => onChange('session_time_limit_min', e.target.value)}
        />
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <div className="form-label">Bloom mix (optional)</div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {BLOOM_LEVELS.map((level) => (
            <Input
              key={level}
              label={BLOOM_LABELS[level]}
              type="number"
              min={0}
              max={10}
              value={config.bloom[level]}
              placeholder="—"
              onChange={(e) => setBloom(level, e.target.value)}
            />
          ))}
        </div>
        <p
          style={{
            fontSize: '0.875rem',
            marginTop: 0,
            color: sumOk ? 'var(--text-muted)' : 'var(--accent)',
          }}
        >
          {blank
            ? 'Leave blank to balance Bloom levels automatically.'
            : `Total ${sum} of ${config.main_question_count} main questions${sumOk ? '' : ' — must match'}.`}
        </p>
      </div>
    </>
  );
}

export default function LecturerExamSessions() {
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Create form state.
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [language, setLanguage] = useState('EN');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [creating, setCreating] = useState(false);

  // Selected session + roster/examiner editing state.
  const [selected, setSelected] = useState(null);
  const [codesText, setCodesText] = useState('');
  const [rosterErrors, setRosterErrors] = useState([]);
  const [savingRoster, setSavingRoster] = useState(false);
  const [examinerText, setExaminerText] = useState('');
  const [savingExaminers, setSavingExaminers] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Edit form state for a DRAFT session.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLanguage, setEditLanguage] = useState('EN');
  const [editConfig, setEditConfig] = useState(DEFAULT_CONFIG);
  const [savingEdit, setSavingEdit] = useState(false);

  // Distinct subject ids present in the lecturer's topics (there is no
  // per-lecturer subjects endpoint; topics carry subject_id).
  const subjectIds = [...new Set(topics.map((t) => t.subject_id).filter((s) => s != null))];
  const topicsForSubject = subjectId
    ? topics.filter((t) => String(t.subject_id) === String(subjectId))
    : [];

  const loadSessions = useCallback(async () => {
    try {
      const data = await listExamSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load exam sessions.');
    }
  }, []);

  // Load topics once (for the subject/topic pickers) and the session list.
  useEffect(() => {
    (async () => {
      try {
        const data = await listTopics();
        setTopics(Array.isArray(data) ? data : []);
      } catch {
        setError('Could not load topics.');
      }
    })();
    loadSessions();
  }, [loadSessions]);

  const resetCreateForm = () => {
    setTitle('');
    setSubjectId('');
    setTopicId('');
    setLanguage('EN');
    setConfig(DEFAULT_CONFIG);
  };

  const handleConfigChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditConfigChange = (field, value) => {
    setEditConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!subjectId || !topicId) {
      setError('Choose a subject and topic before creating a session.');
      return;
    }
    const invalid = validateConfig(config);
    if (invalid) {
      setError(invalid);
      return;
    }
    setCreating(true);
    try {
      await createExamSession({
        subjectId: Number(subjectId),
        topicId: Number(topicId),
        title: title.trim() || undefined,
        language,
        ...configToPayload(config),
      });
      setNotice('Exam session created as a draft.');
      resetCreateForm();
      await loadSessions();
    } catch (err) {
      setError(friendlyError(err, 'Could not create the exam session.'));
    } finally {
      setCreating(false);
    }
  };

  const openDetails = async (session) => {
    setError('');
    setNotice('');
    setRosterErrors([]);
    setCodesText('');
    setExaminerText('');
    setEditing(false);
    try {
      const full = await getExamSession(session.exam_session_id);
      setSelected(full);
    } catch {
      setError('Could not load the session details.');
    }
  };

  // Re-fetch the selected session without clearing the notice/error.
  const refreshSelected = async (session) => {
    try {
      const full = await getExamSession(session.exam_session_id);
      setSelected(full);
    } catch {
      setError('Could not load the session details.');
    }
  };

  const startEdit = () => {
    if (!selected) return;
    setEditTitle(selected.title || '');
    setEditLanguage(selected.language || 'EN');
    setEditConfig(sessionToConfig(selected));
    setEditing(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setNotice('');
    const invalid = validateConfig(editConfig);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSavingEdit(true);
    try {
      await updateExamSession(selected.exam_session_id, {
        title: editTitle.trim() || undefined,
        language: editLanguage,
        ...configToPayload(editConfig),
      });
      setNotice('Session settings saved.');
      setEditing(false);
      await refreshSelected(selected);
      await loadSessions();
    } catch (err) {
      setError(friendlyError(err, 'Could not save the session settings.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveRoster = async () => {
    if (!selected) return;
    setError('');
    setNotice('');
    setRosterErrors([]);
    setSavingRoster(true);
    try {
      const result = await setExamStudents(selected.exam_session_id, codesText);
      setNotice(`Roster saved (${result.students?.length ?? 0} students).`);
      await refreshSelected(selected);
      await loadSessions();
    } catch (err) {
      // The 422 roster response arrives as the thrown error's `details`.
      if (err.status === 422 && Array.isArray(err.details?.errors)) {
        setRosterErrors(err.details.errors);
        setError('Some student codes are invalid. No roster was saved.');
      } else {
        setError('Could not save the roster.');
      }
    } finally {
      setSavingRoster(false);
    }
  };

  const handleSaveExaminers = async () => {
    if (!selected) return;
    setError('');
    setNotice('');
    const lecturerIds = parseLecturerIds(examinerText);
    if (lecturerIds.length === 0) {
      setError('Enter at least one lecturer id.');
      return;
    }
    setSavingExaminers(true);
    try {
      await setExamExaminers(selected.exam_session_id, lecturerIds);
      setNotice('Examiners saved.');
      await refreshSelected(selected);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        setError('Each examiner id must belong to a lecturer.');
      } else {
        setError('Could not save the examiners.');
      }
    } finally {
      setSavingExaminers(false);
    }
  };

  const runTransition = async (action, successMessage, fallback) => {
    if (!selected) return;
    setError('');
    setNotice('');
    setTransitioning(true);
    try {
      await action(selected.exam_session_id);
      setNotice(successMessage);
      setEditing(false);
      await refreshSelected(selected);
      await loadSessions();
    } catch (err) {
      setError(friendlyError(err, fallback));
    } finally {
      setTransitioning(false);
    }
  };

  const handleSchedule = () => {
    if (!selected) return;
    if (!selected.opens_at || !selected.closes_at) {
      setNotice('');
      setError('Set "Opens at" and "Closes at" (Edit settings) before submitting the schedule.');
      return;
    }
    runTransition(
      scheduleExamSession,
      'Schedule submitted. An admin will start the exam during its window.',
      'Could not submit the schedule.',
    );
  };

  const handleUnschedule = () => runTransition(
    unscheduleExamSession,
    'Schedule withdrawn. The session is a draft again.',
    'Could not withdraw the schedule.',
  );

  const handleClose = () => runTransition(
    closeExamSession,
    'Session closed.',
    'Could not close the session.',
  );

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2>New Exam Session</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Create a viva session, build its roster, assign examiners, and submit its schedule. An admin starts the exam.
        </p>
      </div>

      {notice && <Feedback type="success" message={notice} />}
      {error && <Feedback type="error" message={error} />}

      <Card>
        <CardHeader>
          <h3 style={{ margin: 0 }}>Create session</h3>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Input
                label="Title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title"
              />
              <div className="form-group">
                <label className="form-label">Subject</label>
                <select
                  className="form-select"
                  value={subjectId}
                  onChange={(e) => { setSubjectId(e.target.value); setTopicId(''); }}
                >
                  <option value="">Select a subject</option>
                  {subjectIds.map((sid) => (
                    <option key={sid} value={sid}>Subject {sid}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Topic</label>
                <select
                  className="form-select"
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  disabled={!subjectId}
                >
                  <option value="">Select a topic</option>
                  {topicsForSubject.map((t) => (
                    <option key={t.topic_id} value={t.topic_id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Language</label>
                <select
                  className="form-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="EN">English</option>
                  <option value="VI">Vietnamese</option>
                </select>
              </div>
            </div>

            <SessionConfigFields config={config} onChange={handleConfigChange} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button type="submit" variant="primary" icon={<Plus size={16} />} isLoading={creating}>
                Create session
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card style={{ marginTop: '1.5rem' }}>
        <CardHeader>
          <h3 style={{ margin: 0 }}>Your exam sessions</h3>
        </CardHeader>
        <CardBody>
          <Table>
            <Thead>
              <Tr>
                <Th>Title</Th>
                <Th>Topic</Th>
                <Th>Language</Th>
                <Th>Window</Th>
                <Th>Config</Th>
                <Th>Status</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sessions.length === 0 && (
                <Tr>
                  <Td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No exam sessions yet.
                  </Td>
                </Tr>
              )}
              {sessions.map((s) => (
                <Tr key={s.exam_session_id}>
                  <Td>{s.title || `Session ${s.exam_session_id}`}</Td>
                  <Td>Topic {s.topic_id}</Td>
                  <Td>{s.language}</Td>
                  <Td>
                    {s.opens_at || s.closes_at ? (
                      <>
                        <div>{formatDateTime(s.opens_at, '—')}</div>
                        <div style={{ color: 'var(--text-muted)' }}>to {formatDateTime(s.closes_at, '—')}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not set</span>
                    )}
                  </Td>
                  <Td>
                    {s.main_question_count}/{s.max_follow_ups_per_question}/{s.answer_time_limit_sec}/{s.think_time_sec}
                    {s.session_time_limit_sec != null && ` · ${Math.round(s.session_time_limit_sec / 60)} min`}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      Follow-ups total: {s.max_follow_ups_total ?? 'no limit'} · Bloom: {formatBloom(s.bloom_distribution)}
                    </div>
                  </Td>
                  <Td>
                    <Badge type={STATUS_BADGE[s.status] || 'info'}>{s.status}</Badge>
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <Button variant="secondary" icon={<UsersIcon size={16} />} onClick={() => openDetails(s)}>
                      Manage
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {selected && (
        <Card style={{ marginTop: '1.5rem' }}>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>
                {selected.title || `Session ${selected.exam_session_id}`}{' '}
                <Badge type={STATUS_BADGE[selected.status] || 'info'}>{selected.status}</Badge>
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selected.status === 'DRAFT' && (
                  <>
                    <Button
                      variant="secondary"
                      icon={<Pencil size={16} />}
                      onClick={() => (editing ? setEditing(false) : startEdit())}
                    >
                      {editing ? 'Cancel edit' : 'Edit settings'}
                    </Button>
                    <Button
                      variant="primary"
                      icon={<Send size={16} />}
                      onClick={handleSchedule}
                      isLoading={transitioning}
                    >
                      Submit schedule
                    </Button>
                  </>
                )}
                {selected.status === 'SCHEDULED' && (
                  <Button
                    variant="secondary"
                    icon={<Undo2 size={16} />}
                    onClick={handleUnschedule}
                    isLoading={transitioning}
                  >
                    Withdraw
                  </Button>
                )}
                {selected.status === 'OPEN' && (
                  <Button
                    variant="secondary"
                    icon={<Square size={16} />}
                    onClick={handleClose}
                    isLoading={transitioning}
                  >
                    Close
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0 }}>
              Window: {formatDateTime(selected.opens_at)} to {formatDateTime(selected.closes_at)}
              {' · '}Follow-ups per candidate: {selected.max_follow_ups_total ?? 'no limit'}
              {' · '}Bloom mix: {formatBloom(selected.bloom_distribution)}
            </p>
            {selected.status === 'DRAFT' && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Lecturers do not open exams. Submit the schedule and an admin will start the exam during its window.
              </p>
            )}
            {selected.status === 'SCHEDULED' && (
              <Feedback
                type="info"
                message="Scheduled. An admin will start this exam during its window. Withdraw it to make changes."
              />
            )}

            {editing && selected.status === 'DRAFT' && (
              <form onSubmit={handleSaveEdit} style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Input
                    label="Title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Optional title"
                  />
                  <div className="form-group">
                    <label className="form-label">Language</label>
                    <select
                      className="form-select"
                      value={editLanguage}
                      onChange={(e) => setEditLanguage(e.target.value)}
                    >
                      <option value="EN">English</option>
                      <option value="VI">Vietnamese</option>
                    </select>
                  </div>
                </div>
                <SessionConfigFields config={editConfig} onChange={handleEditConfigChange} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" isLoading={savingEdit}>Save settings</Button>
                </div>
              </form>
            )}

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <Textarea
                  label="Student codes"
                  value={codesText}
                  onChange={(e) => setCodesText(e.target.value)}
                  placeholder="Paste student codes, one per line or comma-separated"
                  rows={6}
                  disabled={selected.status !== 'DRAFT'}
                />
                {rosterErrors.length > 0 && (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Code</Th>
                        <Th>Error</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rosterErrors.map((row, idx) => (
                        <Tr key={`${row.code}-${idx}`}>
                          <Td>{row.code}</Td>
                          <Td style={{ color: 'var(--accent)' }}>{row.error}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
                <div style={{ marginTop: '0.5rem' }}>
                  <Button
                    variant="primary"
                    onClick={handleSaveRoster}
                    isLoading={savingRoster}
                    disabled={selected.status !== 'DRAFT'}
                  >
                    Save roster
                  </Button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Current roster: {selected.students?.length ?? 0} students
                </p>
              </div>

              <div style={{ flex: 1, minWidth: '280px' }}>
                <Textarea
                  label="Examiner lecturer ids"
                  value={examinerText}
                  onChange={(e) => setExaminerText(e.target.value)}
                  placeholder="Enter lecturer ids, one per line or comma-separated"
                  rows={6}
                  disabled={selected.status !== 'DRAFT'}
                />
                <div style={{ marginTop: '0.5rem' }}>
                  <Button
                    variant="primary"
                    onClick={handleSaveExaminers}
                    isLoading={savingExaminers}
                    disabled={selected.status !== 'DRAFT'}
                  >
                    Save examiners
                  </Button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  Current examiners: {selected.examiners?.length ?? 0}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
