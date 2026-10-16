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
import { listMaterials, listTopics } from '../../services/materialApi';
import { createGenerationJob, getGenerationJob } from '../../services/questionGenerationApi';

const STATUS_OPTIONS = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'];
const BLOOM_OPTIONS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'];
const SOURCE_OPTIONS = ['MANUAL', 'IMPORT', 'AI'];

// Terminal generation-job states (polling stops here).
const GEN_TERMINAL = new Set(['COMPLETED', 'FAILED']);
const GEN_POLL_MS = 2000;

const emptyGenForm = {
  topicId: '',
  materialIds: [],
  requestedCount: 5,
  distributeEvenly: true,
  bloom: {
    REMEMBER: 0, UNDERSTAND: 0, APPLY: 0, ANALYZE: 0,
  },
  language: 'en',
};

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

  // --- Generate-with-AI modal state ---
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [genForm, setGenForm] = useState(emptyGenForm);
  const [genTopics, setGenTopics] = useState([]);
  const [genMaterials, setGenMaterials] = useState([]);
  const [genError, setGenError] = useState('');
  const [genStatus, setGenStatus] = useState(''); // '', 'RUNNING', 'COMPLETED', 'FAILED'
  const [genResult, setGenResult] = useState(null); // { generatedCount, requestedCount, error }
  const genPollRef = useRef(null);

  const readyMaterials = genMaterials.filter((m) => m.status === 'READY');
  const bloomSum = BLOOM_OPTIONS.reduce((sum, b) => sum + Number(genForm.bloom[b] || 0), 0);

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

  // --- Generate with AI ---------------------------------------------------

  const stopGenPoll = () => {
    if (genPollRef.current) {
      clearInterval(genPollRef.current);
      genPollRef.current = null;
    }
  };

  useEffect(() => () => stopGenPoll(), []);

  const openGenerate = async () => {
    setGenForm(emptyGenForm);
    setGenError('');
    setGenStatus('');
    setGenResult(null);
    setGenMaterials([]);
    setIsGenOpen(true);
    try {
      const topics = await listTopics();
      setGenTopics(Array.isArray(topics) ? topics : []);
    } catch {
      setGenError('Could not load topics.');
    }
  };

  // When the topic changes, load READY materials for its subject.
  const handleGenTopicChange = async (topicId) => {
    setGenForm((prev) => ({ ...prev, topicId, materialIds: [] }));
    setGenMaterials([]);
    const topic = genTopics.find((t) => String(t.topic_id) === String(topicId));
    if (!topic || topic.subject_id == null) return;
    try {
      const data = await listMaterials(topic.subject_id);
      setGenMaterials(Array.isArray(data) ? data : []);
    } catch {
      setGenError('Could not load materials for this subject.');
    }
  };

  const toggleGenMaterial = (materialId) => {
    setGenForm((prev) => {
      const set = new Set(prev.materialIds);
      if (set.has(materialId)) set.delete(materialId);
      else set.add(materialId);
      return { ...prev, materialIds: [...set] };
    });
  };

  const handleGenerate = async () => {
    setGenError('');
    const topicId = Number(genForm.topicId);
    if (!Number.isInteger(topicId) || topicId <= 0) {
      setGenError('Choose a topic.');
      return;
    }
    if (genForm.materialIds.length === 0) {
      setGenError('Select at least one READY material.');
      return;
    }
    const requestedCount = Number(genForm.requestedCount);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20) {
      setGenError('Count must be between 1 and 20.');
      return;
    }

    const body = {
      topicId,
      materialIds: genForm.materialIds.map(Number),
      requestedCount,
      language: genForm.language.trim() || 'en',
    };

    // Omit bloomDistribution when distributing evenly; otherwise it must sum to
    // the requested count (the backend enforces BLOOM_SUM_MISMATCH too).
    if (!genForm.distributeEvenly) {
      if (bloomSum !== requestedCount) {
        setGenError(`Bloom counts must sum to ${requestedCount} (currently ${bloomSum}).`);
        return;
      }
      body.bloomDistribution = { ...genForm.bloom };
    }

    let job;
    try {
      job = await createGenerationJob(body);
    } catch (err) {
      if (err.code === 'MATERIALS_NOT_READY') {
        setGenError('One or more selected materials are not READY in this subject.');
      } else if (err.code === 'BLOOM_SUM_MISMATCH') {
        setGenError('The Bloom distribution must sum to the requested count.');
      } else if (err.code === 'VALIDATION_ERROR') {
        setGenError(err.message || 'Please check the generation settings.');
      } else if (err.code === 'FORBIDDEN') {
        setGenError('You do not have access to this subject.');
      } else {
        setGenError('Could not start generation.');
      }
      return;
    }

    setGenStatus('RUNNING');
    setGenResult(null);
    stopGenPoll();
    genPollRef.current = setInterval(async () => {
      try {
        const fresh = await getGenerationJob(job.id);
        if (GEN_TERMINAL.has(fresh.status)) {
          stopGenPoll();
          setGenStatus(fresh.status);
          setGenResult({
            generatedCount: fresh.generatedCount,
            requestedCount: fresh.requestedCount,
            error: fresh.error,
          });
          await load();
        }
      } catch {
        stopGenPoll();
        setGenStatus('FAILED');
        setGenError('Lost track of the generation job.');
      }
    }, GEN_POLL_MS);
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
          <button className="btn btn-secondary" onClick={openGenerate}>
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

      <Modal isOpen={isGenOpen} onClose={() => { stopGenPoll(); setIsGenOpen(false); }} title="Generate Questions with AI">
        <div className="modal-body">
          {genError && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {genError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Topic</label>
            <select
              className="form-select"
              value={genForm.topicId}
              onChange={(e) => handleGenTopicChange(e.target.value)}
            >
              <option value="">Select a topic</option>
              {genTopics.map((t) => (
                <option key={t.topic_id} value={t.topic_id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Materials (READY only)</label>
            {!genForm.topicId && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Choose a topic to list its materials.</p>
            )}
            {genForm.topicId && readyMaterials.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No READY materials for this subject yet.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '160px', overflowY: 'auto' }}>
              {readyMaterials.map((m) => (
                <label key={m.course_material_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={genForm.materialIds.includes(m.course_material_id)}
                    onChange={() => toggleGenMaterial(m.course_material_id)}
                  />
                  <span>{m.title}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Number of questions (1-20)</label>
            <input
              type="number"
              min={1}
              max={20}
              className="form-input"
              value={genForm.requestedCount}
              onChange={(e) => setGenForm({ ...genForm, requestedCount: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={genForm.distributeEvenly}
                onChange={(e) => setGenForm({ ...genForm, distributeEvenly: e.target.checked })}
              />
              <span>Distribute Bloom levels evenly</span>
            </label>
          </div>

          {!genForm.distributeEvenly && (
            <div className="form-group">
              <label className="form-label">Bloom distribution</label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {BLOOM_OPTIONS.map((b) => (
                  <div key={b} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b}</span>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      style={{ width: '80px' }}
                      value={genForm.bloom[b]}
                      onChange={(e) => setGenForm({
                        ...genForm,
                        bloom: { ...genForm.bloom, [b]: e.target.value },
                      })}
                    />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: bloomSum === Number(genForm.requestedCount) ? '#22c55e' : 'var(--text-muted)' }}>
                Sum: {bloomSum} / {genForm.requestedCount}
              </p>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Language</label>
            <input
              type="text"
              className="form-input"
              value={genForm.language}
              onChange={(e) => setGenForm({ ...genForm, language: e.target.value })}
              placeholder="e.g. en"
            />
          </div>

          {genStatus === 'RUNNING' && (
            <div style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
              Generating... this runs in the background and the list refreshes when done.
            </div>
          )}
          {genStatus === 'COMPLETED' && genResult && (
            <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              Generated {genResult.generatedCount} of {genResult.requestedCount} requested.
              {genResult.error ? ` ${genResult.error}` : ' They are now awaiting review.'}
            </div>
          )}
          {genStatus === 'FAILED' && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {genResult?.error || 'Generation failed.'}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => { stopGenPoll(); setIsGenOpen(false); }}>Close</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={genStatus === 'RUNNING'}>
            {genStatus === 'RUNNING' ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
