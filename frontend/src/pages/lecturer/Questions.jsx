import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import Modal from '../../components/Modal';

export default function LecturerQuestions() {
  const [questions, setQuestions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null); // null means create new

  const [formData, setFormData] = useState({ content: '', status: 'Active' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/lecturer/questions')
      .then(res => res.json())
      .then(data => setQuestions(data))
      .catch(console.error);
  }, []);

  const handleOpenModal = (q = null) => {
    setCurrentQuestion(q);
    setFormData(q ? { content: q.content, status: q.status } : { content: '', status: 'Active' });
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const trimmedContent = formData.content.trim();
    if (!trimmedContent) {
      setError('Question content cannot be empty.');
      return;
    }

    const isDuplicate = questions.some(
      (q) => q.content.toLowerCase().trim() === trimmedContent.toLowerCase() && q.id !== currentQuestion?.id
    );

    if (isDuplicate) {
      setError('This question already exists.');
      return;
    }

    try {
      if (currentQuestion) {
        const updated = { ...currentQuestion, ...formData, content: trimmedContent };
        await fetch(`/api/lecturer/questions/${currentQuestion.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        });
        setQuestions(questions.map(q => q.id === currentQuestion.id ? updated : q));
      } else {
        const newQuestion = { ...formData, content: trimmedContent, rubricId: null };
        const res = await fetch('/api/lecturer/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newQuestion)
        });
        const saved = await res.json();
        setQuestions([...questions, saved]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setError('Failed to save question.');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this question?')) {
      try {
        await fetch(`/api/lecturer/questions/${id}`, { method: 'DELETE' });
        setQuestions(questions.filter(q => q.id !== id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2>Question Management</h2>
          <p style={{ color: 'var(--text-muted)' }}>Create and manage viva examination questions</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} /> Add Question
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" className="form-input" placeholder="Search questions..." style={{ paddingLeft: '2.5rem' }} />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>ID</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Content</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Rubric</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }}>
                <td style={{ padding: '1rem' }}><strong>{q.id}</strong></td>
                <td style={{ padding: '1rem' }}>{q.content}</td>
                <td style={{ padding: '1rem' }}>
                  <span className={`badge ${q.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                    {q.status}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  {q.rubricId ? <span className="badge badge-info">{q.rubricId}</span> : <span style={{ color: 'var(--text-muted)' }}>None</span>}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-icon" onClick={() => handleOpenModal(q)}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn btn-secondary btn-icon" onClick={() => handleDelete(q.id)} style={{ color: 'var(--accent)' }}>
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
          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {error}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Question Content</label>
            <textarea 
              className="form-textarea" 
              rows={4} 
              value={formData.content}
              onChange={(e) => {
                setFormData({...formData, content: e.target.value});
                if (error) setError('');
              }}
              placeholder="Enter the question text here..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select 
              className="form-select"
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
            >
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
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
