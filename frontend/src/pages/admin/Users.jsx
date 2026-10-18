import { useEffect, useRef, useState } from 'react';
import { UserPlus, Upload, Lock, Unlock, Mail } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../components/ui/Loading';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import Modal from '../../components/Modal';
import {
  listUsers,
  createLecturer,
  lockUser,
  unlockUser,
  resendSetup,
  importStudents,
} from '../../services/adminApi';

const statusBadge = (status) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'LOCKED') return 'error';
  return 'info';
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', email: '', fullName: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [importErrors, setImportErrors] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listUsers();
      setUsers(data.users || []);
    } catch {
      setError('Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await createLecturer({
        code: form.code.trim() || undefined,
        email: form.email.trim(),
        fullName: form.fullName.trim() || undefined,
      });
      setCreateOpen(false);
      setForm({ code: '', email: '', fullName: '' });
      setNotice('Lecturer created. A setup link has been emailed.');
      await load();
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') {
        setFormError('That email is already in use.');
      } else if (err.code === 'CODE_TAKEN') {
        setFormError('That code is already in use.');
      } else if (err.status === 400) {
        setFormError('Please provide a valid email address.');
      } else {
        setFormError('Could not create the lecturer.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLockToggle = async (user) => {
    setNotice('');
    setError('');
    try {
      if (user.status === 'LOCKED') {
        await unlockUser(user.id);
      } else {
        await lockUser(user.id);
      }
      await load();
    } catch {
      setError('Could not update the user status.');
    }
  };

  const handleResend = async (user) => {
    setNotice('');
    setError('');
    try {
      await resendSetup(user.id);
      setNotice(`Setup link re-sent to ${user.email}.`);
    } catch {
      setError('Could not resend the setup link.');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErrors(null);
    setNotice('');
    setError('');
    setImporting(true);
    try {
      const data = await importStudents(file);
      setNotice(`Imported ${data.created?.length ?? 0} student(s). Setup links have been emailed.`);
      await load();
    } catch (err) {
      if (err.status === 422 && Array.isArray(err.details?.errors)) {
        setImportErrors(err.details.errors);
      } else if (err.status === 400) {
        setError('The file could not be read. Expected columns: student code, full name, email.');
      } else {
        setError('Could not import students.');
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>Users</h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage lecturers and students</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" icon={<Upload size={16} />} isLoading={importing} onClick={() => fileInputRef.current?.click()}>
            Import students
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => { setFormError(''); setCreateOpen(true); }}>
            Create lecturer
          </Button>
        </div>
      </div>

      {notice && <Feedback type="success" message={notice} />}
      {error && <Feedback type="error" message={error} />}

      {importErrors && (
        <Card style={{ marginBottom: '1.5rem' }}>
          <Feedback
            type="error"
            title="Import failed"
            message="No students were imported. Fix the rows below and upload the file again."
          />
          <Table>
            <Thead>
              <Tr>
                <Th>Row</Th>
                <Th>Errors</Th>
              </Tr>
            </Thead>
            <Tbody>
              {importErrors.map((rowError) => (
                <Tr key={rowError.row}>
                  <Td>{rowError.row}</Td>
                  <Td>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                      {rowError.errors.map((msg, idx) => (
                        <li key={idx} style={{ color: 'var(--accent)' }}>{msg}</li>
                      ))}
                    </ul>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <Card>
        {loading ? (
          <LoadingSpinner text="Loading users..." />
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No users found.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.map((user) => (
                <Tr key={user.id}>
                  <Td>{user.code || '—'}</Td>
                  <Td>{user.fullName || '—'}</Td>
                  <Td>{user.email}</Td>
                  <Td><Badge type="info">{user.role}</Badge></Td>
                  <Td><Badge type={statusBadge(user.status)}>{user.status}</Badge></Td>
                  <Td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Button
                        variant="secondary"
                        icon={user.status === 'LOCKED' ? <Unlock size={14} /> : <Lock size={14} />}
                        onClick={() => handleLockToggle(user)}
                      >
                        {user.status === 'LOCKED' ? 'Unlock' : 'Lock'}
                      </Button>
                      <Button variant="secondary" icon={<Mail size={14} />} onClick={() => handleResend(user)}>
                        Resend setup
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create lecturer">
        <form onSubmit={handleCreate}>
          {formError && <Feedback type="error" message={formError} />}
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Code (optional)"
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            label="Full name (optional)"
            type="text"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={saving}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
