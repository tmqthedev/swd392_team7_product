import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Filter } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';

const mockSessions = [
  { id: 'S001', studentName: 'Jane Doe', studentId: 'SE150123', exam: 'Java Programming Viva', date: '2026-09-25', status: 'Pending Review', aiScore: 8.5 },
  { id: 'S002', studentName: 'John Smith', studentId: 'SE150124', exam: 'Database Systems Viva', date: '2026-09-26', status: 'Approved', aiScore: 9.0 },
  { id: 'S003', studentName: 'Alice Johnson', studentId: 'SE150125', exam: 'Java Programming Viva', date: '2026-09-26', status: 'Pending Review', aiScore: 7.0 },
];

export default function LecturerSessions() {
  const [sessions] = useState(mockSessions);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const filteredSessions = sessions.filter(
    (s) => 
      s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.exam.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Student Exam Sessions</h2>
          <p style={{ color: 'var(--text-muted)' }}>Review and evaluate AI-conducted viva sessions</p>
        </div>
      </div>

      <Card>
        <CardHeader style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search by student name, ID, or exam..." 
                style={{ paddingLeft: '2.5rem' }} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="secondary" icon={<Filter size={18} />}>Filter</Button>
          </div>
        </CardHeader>
        <CardBody>
          <Table>
            <Thead>
              <Tr>
                <Th>Student</Th>
                <Th>Exam</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>AI Score</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredSessions.map((session) => (
                <Tr key={session.id}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{session.studentName}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{session.studentId}</div>
                  </Td>
                  <Td>{session.exam}</Td>
                  <Td>{session.date}</Td>
                  <Td>
                    {session.status === 'Approved' ? (
                      <Badge type="success">{session.status}</Badge>
                    ) : (
                      <Badge type="warning">{session.status}</Badge>
                    )}
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{session.aiScore} / 10</span>
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <Button 
                      variant="secondary" 
                      icon={<Eye size={16} />} 
                      onClick={() => navigate(`/lecturer/evaluation/${session.id}`)}
                    >
                      Review
                    </Button>
                  </Td>
                </Tr>
              ))}
              {filteredSessions.length === 0 && (
                <Tr>
                  <Td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
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
