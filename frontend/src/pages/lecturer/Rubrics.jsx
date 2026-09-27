import { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';

const initialRubrics = [
  { id: 'R1', criteriaDetails: 'Accuracy (50%), Clarity (30%), Terminology (20%)', maxScore: 10 },
  { id: 'R2', criteriaDetails: 'Completeness (40%), Technical Depth (60%)', maxScore: 10 },
];

export default function LecturerRubrics() {
  const [rubrics, setRubrics] = useState(initialRubrics);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRubric, setCurrentRubric] = useState(null);

  const [formData, setFormData] = useState({ criteriaDetails: '', maxScore: 10 });

  const handleOpenModal = (r = null) => {
    setCurrentRubric(r);
    setFormData(r ? { criteriaDetails: r.criteriaDetails, maxScore: r.maxScore } : { criteriaDetails: '', maxScore: 10 });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (currentRubric) {
      setRubrics(rubrics.map(r => r.id === currentRubric.id ? { ...r, ...formData } : r));
    } else {
      setRubrics([...rubrics, { id: `R${Date.now()}`, ...formData }]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this rubric?')) {
      setRubrics(rubrics.filter(r => r.id !== id));
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2>Rubric Management</h2>
          <p style={{ color: 'var(--text-muted)' }}>Define scoring criteria for questions</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} /> Add Rubric
        </button>
      </div>

      <div className="card">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>ID</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Criteria Details</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Max Score</th>
              <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rubrics.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }}>
                <td style={{ padding: '1rem' }}><strong>{r.id}</strong></td>
                <td style={{ padding: '1rem' }}>{r.criteriaDetails}</td>
                <td style={{ padding: '1rem' }}>{r.maxScore}</td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-icon" onClick={() => handleOpenModal(r)}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn btn-secondary btn-icon" onClick={() => handleDelete(r.id)} style={{ color: 'var(--accent)' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={currentRubric ? 'Edit Rubric' : 'Create Rubric'}>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Criteria Details</label>
            <textarea 
              className="form-textarea" 
              rows={3} 
              value={formData.criteriaDetails}
              onChange={(e) => setFormData({...formData, criteriaDetails: e.target.value})}
              placeholder="e.g. Accuracy (50%), Clarity (50%)"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Max Score</label>
            <input 
              type="number"
              className="form-input"
              value={formData.maxScore}
              onChange={(e) => setFormData({...formData, maxScore: parseInt(e.target.value)})}
            />
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
