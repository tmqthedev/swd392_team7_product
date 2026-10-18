import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../../shared/components/Table';
import { Badge } from '../../../shared/components/Badge';
import { Card } from '../../../shared/components/Card';
import { Feedback } from '../../../shared/components/Feedback';
import { EmptyState } from '../../../shared/components/EmptyState';
import { SLOT_STATUS } from '../../../constants/enums';
import { listSessions } from '../services/sessionService';
import { formatSessionDate } from '../../../shared/utils/formatDate';
import './sessions.scss';

function statusLabel(status) {
  return status === SLOT_STATUS.APPROVED ? 'Approved' : 'Pending Review';
}

export default function LecturerSessions() {
  const [sessions, setSessions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    listSessions(searchTerm)
      .then((rows) => {
        if (!cancelled) setSessions(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [searchTerm]);

  return (
    <div className="sessions-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Oral examinations</p>
          <h1>Sessions</h1>
          <p>Recorded viva sittings. Open a session to confirm or adjust the suggested score.</p>
        </div>
      </header>

      {error && <Feedback type="error" message={error} />}

      <Card className="is-flush">
        <div className="panel-toolbar">
          <div className="filters-row">
            <label className="filter-field search-field">
              <span>Search</span>
              <span className="search-control">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  className="form-input"
                  placeholder="Student name, ID, or exam"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </span>
            </label>
          </div>
          {searchTerm.trim() !== '' && (
            <p className="result-count">{sessions.length} session(s) match.</p>
          )}
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            title="No sessions found"
            actions={<Button variant="secondary" onClick={() => setSearchTerm('')}>Clear search</Button>}
          >
            <p>No student, ID, or exam matches that search.</p>
          </EmptyState>
        ) : (
          <Table className="session-table">
            <Thead>
              <Tr>
                <Th>Student</Th>
                <Th>Exam / topic</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>Duration</Th>
                <Th>AI / Final</Th>
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
                  <Td>{session.duration}</Td>
                  <Td>
                    <span className="num">{session.aiScore}</span>
                    <span className="table-meta"> / {session.lecturerScore ?? '—'}</span>
                  </Td>
                  <Td className="cell-actions">
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/lecturer/evaluation/${session.id}`)}
                    >
                      Review
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
