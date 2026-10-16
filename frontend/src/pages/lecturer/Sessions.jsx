import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { listExamSessions } from '../../services/examSessionApi';

// Status -> Badge type, mirroring the exam_session state machine.
const STATUS_BADGE = {
  DRAFT: 'info',
  OPEN: 'success',
  CLOSED: 'warning',
};

export default function LecturerSessions() {
  const [sessions, setSessions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await listExamSessions();
        setSessions(Array.isArray(data) ? data : []);
      } catch {
        setError('Could not load exam sessions.');
      }
    })();
  }, []);

  const term = searchTerm.toLowerCase();
  const filteredSessions = sessions.filter((s) => {
    const title = (s.title || '').toLowerCase();
    return (
      title.includes(term) ||
      String(s.subject_id).includes(term) ||
      String(s.topic_id).includes(term) ||
      (s.language || '').toLowerCase().includes(term) ||
      (s.status || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Exam Sessions</h2>
          <p style={{ color: 'var(--text-muted)' }}>Review your AI-conducted viva sessions</p>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}

      <Card>
        <CardHeader style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search by title, subject, topic, language, or status..."
                style={{ paddingLeft: '2.5rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <Table>
            <Thead>
              <Tr>
                <Th>Title</Th>
                <Th>Subject / Topic</Th>
                <Th>Language</Th>
                <Th>Config</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredSessions.map((session) => (
                <Tr key={session.exam_session_id}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{session.title || `Session ${session.exam_session_id}`}</div>
                  </Td>
                  <Td>Subject {session.subject_id} / Topic {session.topic_id}</Td>
                  <Td>{session.language}</Td>
                  <Td>
                    {session.main_question_count}/{session.max_follow_ups_per_question}/{session.answer_time_limit_sec}/{session.think_time_sec}
                  </Td>
                  <Td>
                    <Badge type={STATUS_BADGE[session.status] || 'info'}>{session.status}</Badge>
                  </Td>
                </Tr>
              ))}
              {filteredSessions.length === 0 && (
                <Tr>
                  <Td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No sessions found matching your search.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
