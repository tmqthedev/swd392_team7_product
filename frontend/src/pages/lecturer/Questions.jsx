import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, Upload, Download, Sparkles, Check, X, Archive } from 'lucide-react';
import Modal from '../../components/Modal';
import {
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  approveQuestion,
  rejectQuestion,
  archiveQuestion,
  importQuestions,
  downloadTemplate,
} from '../../services/questionApi';

const STATUS_OPTIONS = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const BLOOM_OPTIONS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'];
const SOURCE_OPTIONS = ['MANUAL', 'IMPORT', 'AI'];

const STATUS_BADGE = {
  APPROVED: 'badge-success',
  PENDING_REVIEW: 'badge-warning',
  REJECTED: 'badge-danger',
  ARCHIVED: 'badge-info',
  DRAFT: 'badge-info',
};

const emptyForm = {
  content: '',
  status: 'DRAFT',
  bloomLevel: 'REMEMBER',
  language: 'en',
  referenceAnswer: '',
  keyPoints: '',
  purpose: '',
};

export default function LecturerQuestions() {
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ status: '', bloom: '', source: '' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null); // null means create new
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importErrors, setImportErrors] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await listQuestions(filters);
      setQuestions(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load questions.');
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenModal = (q = null) => {
    setCurrentQuestion(q);
    setFormData(
      q
        ? {
            content: q.content || '',
            status: q.status || 'DRAFT',
            bloomLevel: q.bloomLevel || 'REMEMBER',
            language: q.language || 'en',
            referenceAnswer: q.referenceAnswer || '',
            keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints.join(' | ') : '',
            purpose: q.purpose || '',
          }
        : emptyForm
    );
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const trimmedContent = formData.content.trim();
    if (!trimmedContent) {
      setFormError('Question content cannot be empty.');
      return;
    }

    const keyPoints = formData.keyPoints
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);

    const payload = {
      content: trimmedContent,
      status: formData.status,
      bloomLevel: formData.bloomLevel,
      language: formData.language.trim(),
      referenceAnswer: formData.referenceAnswer.trim(),
      keyPoints,
      purpose: formData.purpose.trim(),
    };

    try {
      if (currentQuestion) {
        await updateQuestion(currentQuestion.id, payload);
      } else {
        await createQuestion(payload);
      }
      setIsModalOpen(false);
      setNotice('');
      await load();
    } catch (err) {
      if (err.code === 'DUPLICATE_QUESTION') {
        setFormError('This question already exists.');
      } else {
        setFormError('Failed to save question.');
      }
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    setError('');
    try {
      await deleteQuestion(id);
      await load();
    } catch {
      setError('Could not delete the question.');
    }
  };

  const handleApprove = async (id) => {
    setError('');
    setNotice('');
    try {
      await approveQuestion(id);
      await load();
    } catch (err) {
      if (err.code === 'RUBRIC_REQUIRED') {
        setError('A rubric must be attached before this question can be approved.');
      } else if (err.code === 'INVALID_TRANSITION') {
        setError('This question cannot be approved from its current status.');
      } else {
        setError('Could not approve the question.');
      }
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Enter a reason for rejecting this question:');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to reject a question.');
      return;
    }
    setError('');
    setNotice('');
    try {
      await rejectQuestion(id, reason.trim());
      await load();
    } catch (err) {
      if (err.code === 'INVALID_TRANSITION') {
        setError('This question cannot be rejected from its current status.');
      } else {
        setError('Could not reject the question.');
      }
    }
  };

  const handleArchive = async (id) => {
    setError('');
    setNotice('');
    try {
      await archiveQuestion(id);
      await load();
    } catch (err) {
      if (err.code === 'INVALID_TRANSITION') {
        setError('This question cannot be archived from its current status.');
      } else {
        setError('Could not archive the question.');
      }
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
      const data = await importQuestions(file);
      setNotice(`Imported ${data.created?.length ?? 0} question(s).`);
      await load();
    } catch (err) {
      if (err.status === 422 && Array.isArray(err.details?.errors)) {
        setImportErrors(err.details.errors);
      } else if (err.status === 400) {
        setError('The file could not be read. Download the template to see the expected columns.');
      } else {
        setError('Could not import questions.');
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadTemplate = async () => {
    setError('');
    try {
      await downloadTemplate();
    } catch {
      setError('Could not download the import template.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>Question Management</h2>
          <p style={{ color: 'var(--text-muted)' }}>Create and manage viva examination questions</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
            <Download size={18} /> Template
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload size={18} /> {importing ? 'Importing...' : 'Import Excel'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button className="btn btn-secondary" disabled title="Available in a future release">
            <Sparkles size={18} /> Generate with AI
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={18} /> Add Question
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}

      {importErrors && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            Import failed. No questions were imported. Fix the rows below and upload the file again.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Row</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {importErrors.map((rowError) => (
                <tr key={rowError.row} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem' }}>{rowError.row}</td>
                  <td style={{ padding: '1rem' }}>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                      {rowError.errors.map((msg, idx) => (
                        <li key={idx} style={{ color: 'var(--accent)' }}>{msg}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Bloom level</label>
            <select className="form-select" value={filters.bloom} onChange={(e) => setFilters({ ...filters, bloom: e.target.value })}>
              <option value="">All levels</option>
              {BLOOM_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Source</label>
            <select className="form-select" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>ID</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Content</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Bloom</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Source</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Rubric</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }}>
                <td style={{ padding: '1rem' }}><strong>{q.id}</strong></td>
                <td style={{ padding: '1rem' }}>{q.content}</td>
                <td style={{ padding: '1rem' }}>{q.bloomLevel || '—'}</td>
                <td style={{ padding: '1rem' }}>
                  <span className={`badge ${STATUS_BADGE[q.status] || 'badge-info'}`}>{q.status}</span>
                </td>
                <td style={{ padding: '1rem' }}>{q.source || '—'}</td>
                <td style={{ padding: '1rem' }}>
                  {q.rubricId ? <span className="badge badge-info">{q.rubricId}</span> : <span style={{ color: 'var(--text-muted)' }}>None</span>}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-icon" title="Approve" onClick={() => handleApprove(q.id)}>
                      <Check size={16} />
                    </button>
                    <button className="btn btn-secondary btn-icon" title="Reject" onClick={() => handleReject(q.id)}>
                      <X size={16} />
                    </button>
                    <button className="btn btn-secondary btn-icon" title="Archive" onClick={() => handleArchive(q.id)}>
                      <Archive size={16} />
                    </button>
                    <button className="btn btn-secondary btn-icon" title="Edit" onClick={() => handleOpenModal(q)}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn btn-secondary btn-icon" title="Delete" onClick={() => handleDelete(q.id)} style={{ color: 'var(--accent)' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={currentQuestion ? 'Edit Question' : 'Create Question'}>
        <div className="modal-body">
          {formError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {formError}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Question Content</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={formData.content}
              onChange={(e) => {
                setFormData({ ...formData, content: e.target.value });
                if (formError) setFormError('');
              }}
              placeholder="Enter the question text here..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Bloom Level</label>
            <select
              className="form-select"
              value={formData.bloomLevel}
              onChange={(e) => setFormData({ ...formData, bloomLevel: e.target.value })}
            >
              {BLOOM_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Language</label>
            <input
              type="text"
              className="form-input"
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              placeholder="e.g. en"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Reference Answer</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={formData.referenceAnswer}
              onChange={(e) => setFormData({ ...formData, referenceAnswer: e.target.value })}
              placeholder="The model answer used for grading..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Key Points</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={formData.keyPoints}
              onChange={(e) => setFormData({ ...formData, keyPoints: e.target.value })}
              placeholder="Separate each key point with a | character"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Purpose</label>
            <input
              type="text"
              className="form-input"
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              placeholder="Why this question is asked..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
