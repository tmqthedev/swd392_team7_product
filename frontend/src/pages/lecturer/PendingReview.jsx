import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, ChevronDown, ChevronRight, Check, X, Edit2,
} from 'lucide-react';
import {
  listPendingAiQuestions,
  getQuestionSources,
  approveQuestion,
  rejectQuestion,
  updateQuestion,
  approveBatch,
} from '../../services/reviewApi';
import { listRubrics } from '../../services/rubricApi';

export default function LecturerPendingReview() {
  const [questions, setQuestions] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [sources, setSources] = useState({}); // questionId -> [citations]
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Per-question rubric picks (for individual approve) and the shared batch
  // rubric + selection set.
  const [rubricPick, setRubricPick] = useState({}); // questionId -> rubricId
  const [selected, setSelected] = useState(new Set());
  const [batchRubricId, setBatchRubricId] = useState('');

  // Edit-then-approve form state keyed by question id.
  const [editing, setEditing] = useState(null); // question id being edited
  const [editForm, setEditForm] = useState({ content: '', referenceAnswer: '' });

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await listPendingAiQuestions();
      setQuestions(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load questions awaiting review.');
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        const data = await listRubrics();
        setRubrics(Array.isArray(data) ? data : []);
      } catch {
        // A missing rubric list just disables rubric pickers; not fatal.
      }
    })();
  }, [load]);

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!sources[id]) {
      try {
        const data = await getQuestionSources(id);
        setSources((prev) => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
      } catch {
        setSources((prev) => ({ ...prev, [id]: [] }));
      }
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApprove = async (q) => {
    setError('');
    setNotice('');
    const rubricId = rubricPick[q.id];
    try {
      if (rubricId) {
        // Attach the chosen rubric, then approve.
        await updateQuestion(q.id, { rubricId: Number(rubricId) });
      }
      await approveQuestion(q.id);
      setNotice(`Question ${q.id} approved.`);
      await load();
    } catch (err) {
      if (err.code === 'RUBRIC_REQUIRED') {
        setError('Pick a rubric before approving this question.');
      } else if (err.code === 'INVALID_TRANSITION') {
        setError('This question can no longer be approved.');
      } else {
        setError('Could not approve the question.');
      }
    }
  };

  const startEdit = (q) => {
    setEditing(q.id);
    setEditForm({ content: q.content || '', referenceAnswer: q.referenceAnswer || '' });
  };

  const handleEditThenApprove = async (q) => {
    setError('');
    setNotice('');
    const rubricId = rubricPick[q.id];
    try {
      const patch = {
        content: editForm.content.trim(),
        referenceAnswer: editForm.referenceAnswer.trim(),
      };
      if (rubricId) patch.rubricId = Number(rubricId);
      await updateQuestion(q.id, patch);
      await approveQuestion(q.id);
      setEditing(null);
      setNotice(`Question ${q.id} edited and approved.`);
      await load();
    } catch (err) {
      if (err.code === 'RUBRIC_REQUIRED') {
        setError('Pick a rubric before approving this question.');
      } else if (err.code === 'DUPLICATE_QUESTION') {
        setError('That edited content duplicates an existing question.');
      } else {
        setError('Could not save and approve the question.');
      }
    }
  };

  const handleReject = async (q) => {
    const reason = prompt('Reason for rejecting this question:');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to reject a question.');
      return;
    }
    setError('');
    setNotice('');
    try {
      await rejectQuestion(q.id, reason.trim());
      setNotice(`Question ${q.id} rejected.`);
      await load();
    } catch {
      setError('Could not reject the question.');
    }
  };

  const handleBatchApprove = async () => {
    setError('');
    setNotice('');
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await approveBatch(ids, Number(batchRubricId));
      setNotice(`Approved ${ids.length} question(s).`);
      setSelected(new Set());
      setBatchRubricId('');
      await load();
    } catch (err) {
      if (err.code === 'RUBRIC_REQUIRED') {
        setError('Choose a rubric for the batch.');
      } else if (err.code === 'INVALID_TRANSITION') {
        setError('One of the selected questions can no longer be approved; nothing was changed.');
      } else if (err.code === 'VALIDATION_ERROR') {
        setError(err.message || 'The batch could not be approved.');
      } else {
        setError('Could not approve the batch.');
      }
    }
  };

  const rubricOptions = rubrics.map((r) => (
    <option key={r.id} value={r.id}>Rubric {r.id} (max {r.maxScore})</option>
  ));

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Inbox size={24} /> Pending Review
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>Review and approve AI-generated questions</p>
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

      {/* Batch approval bar */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{selected.size} selected</strong>
        <select
          className="form-select"
          style={{ maxWidth: '240px' }}
          value={batchRubricId}
          onChange={(e) => setBatchRubricId(e.target.value)}
        >
          <option value="">Choose a shared rubric</option>
          {rubricOptions}
        </select>
        <button
          className="btn btn-primary"
          onClick={handleBatchApprove}
          disabled={selected.size === 0 || !batchRubricId}
        >
          <Check size={18} /> Approve selected
        </button>
      </div>

      <div className="card">
        {questions.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
            No AI questions are awaiting review.
          </p>
        )}

        {questions.map((q) => {
          const isExpanded = expandedId === q.id;
          const nearDup = q.rationale?.warnings?.nearDuplicateOf;
          return (
            <div key={q.id} style={{ borderBottom: '1px solid var(--border)', padding: '1rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggleSelect(q.id)}
                  style={{ marginTop: '0.35rem' }}
                />
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={() => toggleExpand(q.id)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>#{q.id}</strong>
                    <span className="badge badge-info">{q.bloomLevel || '—'}</span>
                    {Array.isArray(nearDup) && nearDup.length > 0 && (
                      <span className="badge badge-warning" title="Flagged as a possible near-duplicate">
                        Near-duplicate
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0' }}>{q.content}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="form-select"
                    style={{ maxWidth: '180px' }}
                    value={rubricPick[q.id] || ''}
                    onChange={(e) => setRubricPick({ ...rubricPick, [q.id]: e.target.value })}
                  >
                    <option value="">Rubric...</option>
                    {rubricOptions}
                  </select>
                  <button className="btn btn-secondary btn-icon" title="Approve" onClick={() => handleApprove(q)}>
                    <Check size={16} />
                  </button>
                  <button className="btn btn-secondary btn-icon" title="Edit then approve" onClick={() => startEdit(q)}>
                    <Edit2 size={16} />
                  </button>
                  <button className="btn btn-secondary btn-icon" title="Reject" onClick={() => handleReject(q)} style={{ color: 'var(--accent)' }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {editing === q.id && (
                <div className="card" style={{ marginTop: '1rem', background: 'var(--surface, rgba(255,255,255,0.03))' }}>
                  <div className="form-group">
                    <label className="form-label">Content</label>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={editForm.content}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reference answer</label>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={editForm.referenceAnswer}
                      onChange={(e) => setEditForm({ ...editForm, referenceAnswer: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => handleEditThenApprove(q)}>Save &amp; Approve</button>
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  {/* Left panel: the question details */}
                  <div className="card" style={{ margin: 0 }}>
                    <h4 style={{ marginTop: 0 }}>Question</h4>
                    <p><strong>Bloom:</strong> {q.bloomLevel || '—'}</p>
                    <p><strong>Reference answer:</strong> {q.referenceAnswer || '—'}</p>
                    <div>
                      <strong>Key points:</strong>
                      <ul style={{ marginTop: '0.25rem', paddingLeft: '1.25rem' }}>
                        {(q.keyPoints || []).map((kp, i) => (<li key={i}>{kp}</li>))}
                      </ul>
                    </div>
                    <p><strong>Purpose:</strong> {q.rationale?.purpose || q.purpose || '—'}</p>
                    <p><strong>Synthesis:</strong> {q.rationale?.synthesis || '—'}</p>
                  </div>

                  {/* Right panel: the grounding source chunks */}
                  <div className="card" style={{ margin: 0 }}>
                    <h4 style={{ marginTop: 0 }}>Sources</h4>
                    {(sources[q.id] || []).length === 0 && (
                      <p style={{ color: 'var(--text-muted)' }}>No source citations.</p>
                    )}
                    {(sources[q.id] || []).map((src, i) => (
                      <div key={i} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>
                          {src.materialTitle}
                          {src.location ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {src.location}</span> : null}
                        </div>
                        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          {src.excerpt || src.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
