import { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Square, Users as UsersIcon } from 'lucide-react';
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
  setExamStudents,
  setExamExaminers,
  openExamSession,
  closeExamSession,
  listTopics,
} from '../../services/examSessionApi';

// Nhom-3 config defaults, mirrored from the backend's createSession defaults.
const DEFAULT_CONFIG = {
  main_question_count: 3,
  max_follow_ups_per_question: 2,
  answer_time_limit_sec: 120,
  think_time_sec: 0,
  // Total interview time, entered in minutes and sent as seconds (backend
  // default 1800 s, range 60-14400 s).
  session_time_limit_min: 30,
};

const STATUS_BADGE = {
  DRAFT: 'info',
  OPEN: 'success',
  CLOSED: 'warning',
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

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!subjectId || !topicId) {
      setError('Choose a subject and topic before creating a session.');
      return;
    }
    setCreating(true);
    try {
      await createExamSession({
        subjectId: Number(subjectId),
        topicId: Number(topicId),
        title: title.trim() || undefined,
        language,
        main_question_count: Number(config.main_question_count),
        max_follow_ups_per_question: Number(config.max_follow_ups_per_question),
        answer_time_limit_sec: Number(config.answer_time_limit_sec),
        think_time_sec: Number(config.think_time_sec),
        session_time_limit_sec: Number(config.session_time_limit_min) * 60,
      });
      setNotice('Exam session created.');
      resetCreateForm();
      await loadSessions();
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        setError('Please check the language and config values.');
      } else if (err.code === 'FORBIDDEN') {
        setError('You do not have access to this subject.');
      } else {
        setError('Could not create the exam session.');
      }
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
    try {
      const full = await getExamSession(session.exam_session_id);
      setSelected(full);
    } catch {
      setError('Could not load the session details.');
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
      await openDetails(selected);
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
      await openDetails(selected);
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

  const handleOpen = async () => {
    if (!selected) return;
    setError('');
    setNotice('');
    setTransitioning(true);
    try {
      await openExamSession(selected.exam_session_id);
      setNotice('Session opened.');
      await openDetails(selected);
      await loadSessions();
    } catch (err) {
      if (err.code === 'NOT_ENOUGH_QUESTIONS') {
        setError('Not enough approved questions in the topic to open this session.');
      } else if (err.code === 'INVALID_TRANSITION') {
        setError('This session cannot be opened from its current status.');
      } else {
        setError('Could not open the session.');
      }
    } finally {
      setTransitioning(false);
    }
  };

  const handleClose = async () => {
    if (!selected) return;
    setError('');
    setNotice('');
    setTransitioning(true);
    try {
      await closeExamSession(selected.exam_session_id);
      setNotice('Session closed.');
      await openDetails(selected);
      await loadSessions();
    } catch (err) {
      if (err.code === 'INVALID_TRANSITION') {
        setError('This session cannot be closed from its current status.');
      } else {
        setError('Could not close the session.');
      }
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2>New Exam Session</h2>
        <p style={{ color: 'var(--text-muted)' }}>Create a viva session, build its roster, assign examiners, and open it</p>
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

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Input
                label="Main questions"
                type="number"
                min={1}
                max={10}
                value={config.main_question_count}
                onChange={(e) => handleConfigChange('main_question_count', e.target.value)}
              />
              <Input
                label="Max follow-ups / question"
                type="number"
                min={0}
                max={5}
                value={config.max_follow_ups_per_question}
                onChange={(e) => handleConfigChange('max_follow_ups_per_question', e.target.value)}
              />
              <Input
                label="Answer time limit (sec)"
                type="number"
                min={10}
                max={600}
                value={config.answer_time_limit_sec}
                onChange={(e) => handleConfigChange('answer_time_limit_sec', e.target.value)}
              />
              <Input
                label="Think time (sec)"
                type="number"
                min={0}
                max={300}
                value={config.think_time_sec}
                onChange={(e) => handleConfigChange('think_time_sec', e.target.value)}
              />
              <Input
                label="Session time limit (min)"
                type="number"
                min={1}
                max={240}
                value={config.session_time_limit_min}
                onChange={(e) => handleConfigChange('session_time_limit_min', e.target.value)}
              />
            </div>

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
                <Th>Config</Th>
                <Th>Status</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sessions.length === 0 && (
                <Tr>
                  <Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
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
                    {s.main_question_count}/{s.max_follow_ups_per_question}/{s.answer_time_limit_sec}/{s.think_time_sec}
                    {s.session_time_limit_sec != null && ` · ${Math.round(s.session_time_limit_sec / 60)} min`}
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant="primary"
                  icon={<Play size={16} />}
                  onClick={handleOpen}
                  isLoading={transitioning}
                  disabled={selected.status !== 'DRAFT'}
                >
                  Open
                </Button>
                <Button
                  variant="secondary"
                  icon={<Square size={16} />}
                  onClick={handleClose}
                  isLoading={transitioning}
                  disabled={selected.status !== 'OPEN'}
                >
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
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
