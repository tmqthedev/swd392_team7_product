import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users as UsersIcon, GraduationCap } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../components/ui/Loading';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import Modal from '../../components/Modal';
import {
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  assignLecturers,
  listSubjectStudents,
  assignStudents,
  listUsers,
} from '../../services/adminApi';

export default function AdminSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null => create
  const [form, setForm] = useState({ code: '', name: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSubject, setAssignSubject] = useState(null);
  const [selectedLecturers, setSelectedLecturers] = useState([]);
  const [assigning, setAssigning] = useState(false);

  // Student enrollment state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSubject, setEnrollSubject] = useState(null);
  const [codesText, setCodesText] = useState('');
  const [enrollErrors, setEnrollErrors] = useState([]);
  const [enrolling, setEnrolling] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [subjectData, lecturerData] = await Promise.all([
        listSubjects(),
        listUsers('LECTURER'),
      ]);
      setSubjects(subjectData.subjects || []);
      setLecturers(lecturerData.users || []);
    } catch {
      setError('Could not load subjects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '' });
    setFormError('');
    setEditOpen(true);
  };

  const openEdit = (subject) => {
    setEditing(subject);
    setForm({ code: subject.code, name: subject.name });
    setFormError('');
    setEditOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (editing) {
        await updateSubject(editing.id, { code: form.code.trim(), name: form.name.trim() });
        setNotice('Subject updated.');
      } else {
        await createSubject({ code: form.code.trim(), name: form.name.trim() });
        setNotice('Subject created.');
      }
      setEditOpen(false);
      await load();
    } catch (err) {
      if (err.status === 400) {
        setFormError('Code and name are required.');
      } else {
        setFormError('Could not save the subject.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (subject) => {
    setNotice('');
    setError('');
    try {
      await deleteSubject(subject.id);
      setNotice('Subject deleted.');
      await load();
    } catch {
      setError('Could not delete the subject.');
    }
  };

  const openAssign = (subject) => {
    setAssignSubject(subject);
    setSelectedLecturers([]);
    setAssignOpen(true);
  };

  const toggleLecturer = (id) => {
    setSelectedLecturers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    setAssigning(true);
    setError('');
    try {
      await assignLecturers(assignSubject.id, selectedLecturers);
      setAssignOpen(false);
      setNotice(`Lecturers assigned to ${assignSubject.name}.`);
    } catch {
      setError('Could not assign lecturers.');
    } finally {
      setAssigning(false);
    }
  };

  const openEnroll = async (subject) => {
    setEnrollSubject(subject);
    setCodesText('');
    setEnrollErrors([]);
    setEnrollOpen(true);
    setLoadingStudents(true);
    try {
      const data = await listSubjectStudents(subject.id);
      const codes = (data.students || []).map((s) => s.code).filter(Boolean);
      setCodesText(codes.join('\n'));
    } catch {
      setEnrollErrors([{ code: 'ALL', error: 'Could not load currently enrolled students.' }]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setEnrolling(true);
    setEnrollErrors([]);
    try {
      const res = await assignStudents(enrollSubject.id, codesText);
      if (!res.ok) {
        setEnrollErrors(res.errors || [{ code: 'UNKNOWN', error: 'Failed to enroll students.' }]);
        return;
      }
      setEnrollOpen(false);
      setNotice(`Students enrolled into ${enrollSubject.name}.`);
    } catch (err) {
      if (err.details && Array.isArray(err.details.errors)) {
        setEnrollErrors(err.details.errors);
      } else if (err.errors) {
        setEnrollErrors(err.errors);
      } else {
        setEnrollErrors([{ code: 'GENERAL', error: err.message || 'Could not enroll students.' }]);
      }
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>Subjects</h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage subjects, lecturer assignments and student enrollment</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
          Create subject
        </Button>
      </div>

      {notice && <Feedback type="success" message={notice} />}
      {error && <Feedback type="error" message={error} />}

      <Card>
        {loading ? (
          <LoadingSpinner text="Loading subjects..." />
        ) : subjects.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No subjects found.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {subjects.map((subject) => (
                <Tr key={subject.id}>
                  <Td>{subject.code}</Td>
                  <Td>{subject.name}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Button variant="secondary" icon={<UsersIcon size={14} />} onClick={() => openAssign(subject)}>
                        Assign lecturers
                      </Button>
                      <Button variant="secondary" icon={<GraduationCap size={14} />} onClick={() => openEnroll(subject)}>
                        Students
                      </Button>
                      <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => openEdit(subject)}>
                        Edit
                      </Button>
                      <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => handleDelete(subject)}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={editing ? 'Edit subject' : 'Create subject'}>
        <form onSubmit={handleSave}>
          {formError && <Feedback type="error" message={formError} />}
          <Input
            label="Code"
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Input
            label="Name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={saving}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign lecturers${assignSubject ? ` — ${assignSubject.name}` : ''}`}>
        <form onSubmit={handleAssign}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Selecting lecturers replaces the current assignment set for this subject.
          </p>
          {lecturers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No lecturers available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
              {lecturers.map((lecturer) => (
                <label key={lecturer.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedLecturers.includes(lecturer.id)}
                    onChange={() => toggleLecturer(lecturer.id)}
                  />
                  <span>{lecturer.fullName || lecturer.email} ({lecturer.code || lecturer.email})</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={assigning}>Save assignment</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} title={`Enroll students${enrollSubject ? ` — ${enrollSubject.name}` : ''}`}>
        <form onSubmit={handleEnroll}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Paste student codes (one per line or comma-separated). Saving replaces the student enrollment set for this subject.
          </p>
          {loadingStudents ? (
            <LoadingSpinner text="Loading enrolled students..." />
          ) : (
            <>
              <Textarea
                label="Student codes"
                value={codesText}
                onChange={(e) => setCodesText(e.target.value)}
                placeholder="SE123456&#10;SE123457"
                rows={6}
              />
              {enrollErrors.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Code</Th>
                        <Th>Error</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {enrollErrors.map((row, idx) => (
                        <Tr key={`${row.code}-${idx}`}>
                          <Td>{row.code}</Td>
                          <Td style={{ color: 'var(--accent)' }}>{row.error}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={enrolling}>Save enrollment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
