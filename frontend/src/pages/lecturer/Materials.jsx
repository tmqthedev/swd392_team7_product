import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Trash2, FileText } from 'lucide-react';
import {
  listMaterials,
  uploadMaterial,
  deleteMaterial,
  listTopics,
} from '../../services/materialApi';

// Materials in these states are still being processed, so the page polls until
// they settle (READY or FAILED).
const PENDING_STATES = new Set(['UPLOADED', 'PROCESSING']);
const POLL_INTERVAL_MS = 4000;

const STATUS_BADGE = {
  READY: 'badge-success',
  PROCESSING: 'badge-warning',
  UPLOADED: 'badge-info',
  FAILED: 'badge-danger',
};

// Human-friendly type label. DOCX has no page/slide count, so the backend
// leaves page_count null; show "Document" for it.
function typeLabel(mime) {
  if (!mime) return '—';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('presentationml')) return 'PPTX';
  if (mime.includes('wordprocessingml')) return 'DOCX';
  return mime;
}

function sizeLabel(bytes) {
  if (bytes == null) return '—';
  const kb = Number(bytes) / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// PDF/PPTX carry a page/slide count; DOCX is a single "Document".
function pageSlideLabel(material) {
  if (material.page_count == null) {
    return material.mime_type && material.mime_type.includes('wordprocessingml')
      ? 'Document'
      : '—';
  }
  if (material.mime_type && material.mime_type.includes('presentationml')) {
    return `${material.page_count} slides`;
  }
  return `${material.page_count} pages`;
}

export default function LecturerMaterials() {
  const [topics, setTopics] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [materials, setMaterials] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // Distinct subject ids present in the lecturer's topics (there is no
  // per-lecturer subjects endpoint; topics carry subject_id).
  const subjectIds = [...new Set(topics.map((t) => t.subject_id).filter((s) => s != null))];
  const topicsForSubject = subjectId
    ? topics.filter((t) => String(t.subject_id) === String(subjectId))
    : [];

  const loadMaterials = useCallback(async (sid) => {
    if (!sid) {
      setMaterials([]);
      return;
    }
    try {
      const data = await listMaterials(sid);
      setMaterials(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load materials for this subject.');
    }
  }, []);

  // Load the topic list once so we can derive subjects + the topic selector.
  useEffect(() => {
    (async () => {
      try {
        const data = await listTopics();
        setTopics(Array.isArray(data) ? data : []);
      } catch {
        setError('Could not load topics.');
      }
    })();
  }, []);

  // Reload materials whenever the chosen subject changes.
  useEffect(() => {
    loadMaterials(subjectId);
  }, [subjectId, loadMaterials]);

  // Poll while any material is still being ingested, and stop once they settle.
  useEffect(() => {
    const anyPending = materials.some((m) => PENDING_STATES.has(m.status));
    if (!anyPending || !subjectId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return undefined;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(() => loadMaterials(subjectId), POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [materials, subjectId, loadMaterials]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!subjectId) {
      setError('Choose a subject before uploading.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError('');
    setNotice('');
    setUploading(true);
    try {
      await uploadMaterial({ file, subjectId, topicId: topicId || undefined });
      setNotice(`Uploaded ${file.name}. Ingestion started.`);
      await loadMaterials(subjectId);
    } catch (err) {
      if (err.code === 'UNSUPPORTED_TYPE') {
        setError('Only PDF, DOCX, and PPTX files are supported.');
      } else if (err.code === 'FILE_TOO_LARGE') {
        setError('That file exceeds the 50MB limit.');
      } else if (err.code === 'FORBIDDEN') {
        setError('You do not have access to this subject.');
      } else {
        setError('Could not upload the file.');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (material) => {
    if (!confirm(`Delete "${material.title}"? This cannot be undone.`)) return;
    setError('');
    setNotice('');
    try {
      await deleteMaterial(material.course_material_id);
      await loadMaterials(subjectId);
    } catch (err) {
      if (err.code === 'MATERIAL_IN_USE') {
        setError('This material is cited by existing questions and cannot be deleted.');
      } else {
        setError('Could not delete the material.');
      }
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2>Course Materials</h2>
        <p style={{ color: 'var(--text-muted)' }}>Upload documents used to generate grounded questions</p>
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

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Topic (optional)</label>
            <select
              className="form-select"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!subjectId}
            >
              <option value="">No topic</option>
              {topicsForSubject.map((t) => (
                <option key={t.topic_id} value={t.topic_id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={!subjectId || uploading}
            >
              <Upload size={18} /> {uploading ? 'Uploading...' : 'Upload material'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx"
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Title</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Type</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Size</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Pages / Slides</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {subjectId ? 'No materials uploaded for this subject yet.' : 'Select a subject to view its materials.'}
                </td>
              </tr>
            )}
            {materials.map((m) => (
              <tr key={m.course_material_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={16} /> {m.title}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>{typeLabel(m.mime_type)}</td>
                <td style={{ padding: '1rem' }}>{sizeLabel(m.size_bytes)}</td>
                <td style={{ padding: '1rem' }}>{pageSlideLabel(m)}</td>
                <td style={{ padding: '1rem' }}>
                  <span className={`badge ${STATUS_BADGE[m.status] || 'badge-info'}`}>{m.status}</span>
                  {m.status === 'FAILED' && m.error && (
                    <div style={{ color: 'var(--accent)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{m.error}</div>
                  )}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button
                    className="btn btn-secondary btn-icon"
                    title="Delete"
                    onClick={() => handleDelete(m)}
                    style={{ color: 'var(--accent)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
