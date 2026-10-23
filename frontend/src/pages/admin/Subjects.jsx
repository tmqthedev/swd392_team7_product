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
  const [enrollTab, setEnrollTab] = useState('list'); // 'list' | 'paste'
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');

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
    setEnrollTab('list');
    setStudentSearch('');
    setEnrollOpen(true);
    setLoadingStudents(true);
    try {
      const [subjectData, usersData] = await Promise.all([
        listSubjectStudents(subject.id),
        listUsers('STUDENT'),
      ]);
      const currentStudents = subjectData?.students || [];
      const codes = currentStudents.map((s) => s.code).filter(Boolean);
      const ids = currentStudents.map((s) => s.app_user_id || s.id).filter(Boolean);
      setCodesText(codes.join('\n'));
      setSelectedStudentIds(ids);
      const activeStudents = (usersData?.users || []).filter((u) => u.status === 'ACTIVE');
      setAllStudents(activeStudents);
    } catch {
      setEnrollErrors([{ code: 'ALL', error: 'Could not load students.' }]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setEnrollErrors([]);

    let payload;
    if (enrollTab === 'list') {
      if (selectedStudentIds.length === 0) {
        const confirmed = window.confirm('Are you sure you want to remove all enrolled students from this subject?');
        if (!confirmed) return;
      }
      payload = { studentIds: selectedStudentIds };
    } else {
      if (!codesText.trim()) {
        const confirmed = window.confirm('Are you sure you want to remove all enrolled students from this subject?');
        if (!confirmed) return;
      }
      payload = codesText;
    }

    setEnrolling(true);
    try {
      const res = await assignStudents(enrollSubject.id, payload);
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
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              type="button"
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                background: enrollTab === 'list' ? 'var(--primary)' : 'transparent',
                color: enrollTab === 'list' ? '#fff' : 'var(--text-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: enrollTab === 'list' ? 600 : 400,
              }}
              onClick={() => setEnrollTab('list')}
            >
              Select from list
            </button>
            <button
              type="button"
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                background: enrollTab === 'paste' ? 'var(--primary)' : 'transparent',
                color: enrollTab === 'paste' ? '#fff' : 'var(--text-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: enrollTab === 'paste' ? 600 : 400,
              }}
              onClick={() => setEnrollTab('paste')}
            >
              Paste student codes
            </button>
          </div>

          {loadingStudents ? (
            <LoadingSpinner text="Loading enrolled students..." />
          ) : enrollTab === 'list' ? (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                <Input
                  placeholder="Search by code or name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const term = studentSearch.trim().toLowerCase();
                    const matched = allStudents.filter((s) => !term || (s.code && s.code.toLowerCase().includes(term)) || (s.full_name && s.full_name.toLowerCase().includes(term)));
                    setSelectedStudentIds(Array.from(new Set([...selectedStudentIds, ...matched.map((s) => s.app_user_id || s.id)])));
                  }}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedStudentIds([])}
                >
                  Clear
                </Button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Selected: {selectedStudentIds.length} student(s)
              </p>
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <Table>
                  <Thead>
                    <Tr>
                      <Th style={{ width: '40px' }}></Th>
                      <Th>Code</Th>
                      <Th>Name</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {allStudents
                      .filter((s) => {
                        const term = studentSearch.trim().toLowerCase();
                        if (!term) return true;
                        return (s.code && s.code.toLowerCase().includes(term)) || (s.full_name && s.full_name.toLowerCase().includes(term));
                      })
                      .map((stu) => {
                        const id = stu.app_user_id || stu.id;
                        const isChecked = selectedStudentIds.includes(id);
                        return (
                          <Tr
                            key={id}
                            onClick={() => {
                              setSelectedStudentIds((prev) =>
                                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                              );
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <Td>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedStudentIds((prev) =>
                                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Td>
                            <Td><strong>{stu.code}</strong></Td>
                            <Td>{stu.full_name || '—'}</Td>
                          </Tr>
                        );
                      })}
                  </Tbody>
                </Table>
              </div>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Paste student codes (one per line or comma-separated). Saving replaces the student enrollment set for this subject.
              </p>
              <Textarea
                label="Student codes"
                value={codesText}
                onChange={(e) => setCodesText(e.target.value)}
                placeholder="SE123456&#10;SE123457"
                rows={6}
              />
            </>
          )}

          {enrollErrors.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Code / ID</Th>
                    <Th>Error</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {enrollErrors.map((row, idx) => (
                    <Tr key={`${row.code || row.id || idx}-${idx}`}>
                      <Td>{row.code || row.id || '—'}</Td>
                      <Td style={{ color: 'var(--accent)' }}>{row.error}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
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
