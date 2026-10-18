import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import Modal from '../../../shared/components/Modal';
import { Button } from '../../../shared/components/Button';
import { Badge } from '../../../shared/components/Badge';
import { Card } from '../../../shared/components/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../../shared/components/Table';
import { Feedback } from '../../../shared/components/Feedback';
import { LoadingSpinner } from '../../../shared/components/Loading';
import { EmptyState } from '../../../shared/components/EmptyState';
import { deleteRubric, listRubrics, saveRubric } from '../services/rubricService';
import './index.scss';

function emptyForm() {
  return {
    id: null,
    name: '',
    criteria: [{ id: `tmp-${Date.now()}`, name: '', maxScore: 5 }],
  };
}

export default function LecturerRubrics() {
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadRubrics = async () => {
    const rows = await listRubrics();
    setRubrics(rows);
  };

  useEffect(() => {
    let cancelled = false;
    loadRubrics()
      .catch((error) => {
        if (!cancelled) setPageError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = formData.criteria.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0);

  const handleOpenModal = (rubric = null) => {
    setFormData(
      rubric
        ? { id: rubric.id, name: rubric.name, criteria: rubric.criteria.map((item) => ({ ...item })) }
        : emptyForm()
    );
    setFormError('');
    setIsModalOpen(true);
  };

  const updateCriterion = (index, patch) => {
    setFormData((current) => ({
      ...current,
      criteria: current.criteria.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      await saveRubric(formData);
      setIsModalOpen(false);
      await loadRubrics();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this rubric?')) return;
    try {
      await deleteRubric(id);
      await loadRubrics();
    } catch (error) {
      setPageError(error.message);
    }
  };

  return (
    <div className="rubrics-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Marking schemes</p>
          <h1>Rubrics</h1>
          <p>Criteria and maximum scores used when a viva answer is marked.</p>
        </div>
        <Button onClick={() => handleOpenModal()} icon={<Plus size={16} />}>
          Add rubric
        </Button>
      </header>

      {pageError && <Feedback type="error" message={pageError} />}

      <Card className="is-flush">
        {loading ? (
          <div className="empty-state">
            <LoadingSpinner text="Loading rubrics..." />
          </div>
        ) : rubrics.length === 0 ? (
          <EmptyState
            title="No rubrics found"
            actions={<Button onClick={() => handleOpenModal()}>Add rubric</Button>}
          >
            <p>Create a rubric so viva answers can be scored against shared criteria.</p>
          </EmptyState>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Rubric</Th>
                <Th>Criteria</Th>
                <Th>Max score</Th>
                <Th>Status</Th>
                <Th className="cell-actions">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rubrics.map((rubric) => (
                <Tr key={rubric.id}>
                  <Td>
                    <div className="rubric-name">{rubric.name}</div>
                    <div className="table-meta">{rubric.id}</div>
                  </Td>
                  <Td>
                    <ul className="mark-scheme">
                      {rubric.criteria.map((item) => (
                        <li key={item.id}>
                          <span>{item.name}</span>
                          <span className="mark-weight">{item.maxScore} pts</span>
                        </li>
                      ))}
                    </ul>
                  </Td>
                  <Td><span className="num">{rubric.maxScore}</span></Td>
                  <Td><Badge type="neutral">In use</Badge></Td>
                  <Td className="cell-actions">
                    <div className="row-actions">
                      <Button variant="secondary" className="btn-icon" onClick={() => handleOpenModal(rubric)} aria-label={`Edit ${rubric.name}`}>
                        <Edit2 size={15} />
                      </Button>
                      <Button variant="secondary" className="btn-icon" onClick={() => handleDelete(rubric.id)} aria-label={`Delete ${rubric.name}`}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? 'Edit Rubric' : 'Create Rubric'}>
        <div className="modal-body">
          {formError && <Feedback type="error" message={formError} />}
          <div className="form-group">
            <label className="form-label" htmlFor="rubric-name">Name</label>
            <input
              id="rubric-name"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="criteria-editor">
            <div className="criteria-editor-head">
              <span>Criterion</span>
              <span>Max</span>
              <span aria-hidden="true" />
              <strong>Total {total} pts</strong>
            </div>
            {formData.criteria.map((item, index) => (
              <div className="criteria-row" key={item.id}>
                <input
                  className="form-input"
                  aria-label={`Criterion ${index + 1} name`}
                  placeholder="Criterion"
                  value={item.name}
                  onChange={(e) => updateCriterion(index, { name: e.target.value })}
                />
                <input
                  className="form-input criteria-score"
                  type="number"
                  min="1"
                  aria-label={`${item.name || `Criterion ${index + 1}`} max score`}
                  value={item.maxScore}
                  onChange={(e) => updateCriterion(index, { maxScore: Number(e.target.value) })}
                />
                <Button
                  variant="secondary"
                  className="btn-icon"
                  disabled={formData.criteria.length === 1}
                  onClick={() =>
                    setFormData((current) => ({
                      ...current,
                      criteria: current.criteria.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                  aria-label="Remove criterion"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setFormData((current) => ({
                  ...current,
                  criteria: [...current.criteria, { id: `tmp-${Date.now()}`, name: '', maxScore: 1 }],
                }))
              }
            >
              Add criterion
            </Button>
          </div>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} isLoading={saving}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
