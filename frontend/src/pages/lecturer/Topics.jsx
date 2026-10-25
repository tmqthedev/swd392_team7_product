import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Filter, Layers, AlertTriangle } from 'lucide-react';
import Modal from '../../components/Modal';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../shared/components/Loading';
import { listTopics, createTopic, updateTopic, deleteTopic } from '../../services/topicApi';
import { getExamSessionOptions } from '../../services/examSessionApi';

export default function LecturerTopics() {
  const [topics, setTopics] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTopic, setCurrentTopic] = useState(null); // null = create mode
  const [formData, setFormData] = useState({ name: '', subject_id: '', course_id: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTopicsAndOptions = useCallback(async () => {
    const [topicsData, optionsData] = await Promise.all([
      listTopics(),
      getExamSessionOptions().catch(() => ({ subjects: [] })),
    ]);
    return {
      topics: Array.isArray(topicsData) ? topicsData : [],
      subjects: Array.isArray(optionsData?.subjects) ? optionsData.subjects : [],
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchTopicsAndOptions();
      setTopics(data.topics);
      setSubjects(data.subjects);
    } catch (err) {
      setError(err.message || 'Could not load topics.');
    } finally {
      setLoading(false);
    }
  }, [fetchTopicsAndOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError('');
        const data = await fetchTopicsAndOptions();
        if (!cancelled) {
          setTopics(data.topics);
          setSubjects(data.subjects);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load topics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTopicsAndOptions]);

  // Map subject_id -> subject object
  const subjectMap = useMemo(() => {
    const map = new Map();
    for (const s of subjects) {
      map.set(Number(s.subject_id), s);
    }
    return map;
  }, [subjects]);

  // Map topic_id -> approved count
  const approvedCounts = useMemo(() => {
    const counts = new Map();
    for (const s of subjects) {
      for (const t of s.topics || []) {
        counts.set(Number(t.topic_id), t.approved ?? 0);
      }
    }
    return counts;
  }, [subjects]);

  // Filtered topics list
  const filteredTopics = useMemo(() => {
    return topics.filter((t) => {
      if (selectedSubjectFilter) {
        if (selectedSubjectFilter === 'unassigned') {
          if (t.subject_id != null) return false;
        } else if (Number(t.subject_id) !== Number(selectedSubjectFilter)) {
          return false;
        }
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = (t.name || '').toLowerCase().includes(query);
        const codeMatch = (t.course_id || '').toLowerCase().includes(query);
        const subj = t.subject_id ? subjectMap.get(Number(t.subject_id)) : null;
        const subjMatch = subj ? (subj.name.toLowerCase().includes(query) || subj.code.toLowerCase().includes(query)) : false;
        return nameMatch || codeMatch || subjMatch;
      }
      return true;
    });
  }, [topics, selectedSubjectFilter, searchTerm, subjectMap]);

  // Open Create/Edit Modal
  const handleOpenModal = (topic = null) => {
    setCurrentTopic(topic);
    setFormError('');
    if (topic) {
      setFormData({
        name: topic.name || '',
        subject_id: topic.subject_id ? String(topic.subject_id) : '',
        course_id: topic.course_id || '',
      });
    } else {
      // Default to first subject if available
      setFormData({
        name: '',
        subject_id: subjects.length > 0 ? String(subjects[0].subject_id) : '',
        course_id: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentTopic(null);
    setFormError('');
    setIsSubmitting(false);
  };

  // Submit Create/Edit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Topic name is required.');
      return;
    }

    if (!formData.subject_id) {
      setFormError('Please select a subject.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        subject_id: Number(formData.subject_id),
        course_id: formData.course_id.trim() || null,
      };

      if (currentTopic) {
        await updateTopic(currentTopic.topic_id, payload);
        setNotice(`Topic "${trimmedName}" updated successfully.`);
      } else {
        await createTopic(payload);
        setNotice(`Topic "${trimmedName}" created successfully.`);
      }

      handleCloseModal();
      await reload();
    } catch (err) {
      setFormError(err.message || 'Failed to save topic.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete Confirmation
  const handleOpenDelete = (topic) => {
    setDeleteTarget(topic);
    setDeleteError('');
  };

  const handleCloseDelete = () => {
    setDeleteTarget(null);
    setDeleteError('');
    setIsDeleting(false);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteTopic(deleteTarget.topic_id);
      setNotice(`Topic "${deleteTarget.name}" deleted successfully.`);
      handleCloseDelete();
      await reload();
    } catch (err) {
      if (err.status === 409 || err.code === 'RESOURCE_IN_USE' || err.code === 'INVALID_FOREIGN_KEY') {
        setDeleteError('Không thể xoá chủ đề này vì đang có câu hỏi, tài liệu hoặc kỳ thi liên kết.');
      } else {
        setDeleteError(err.message || 'Could not delete topic.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>
            <Layers size={28} />
            Topics
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Manage exam topics for your assigned subjects.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => handleOpenModal()}
          disabled={subjects.length === 0}
        >
          Create Topic
        </Button>
      </div>

      {notice && (
        <Feedback
          type="success"
          message={notice}
          className="mb-4"
          onClose={() => setNotice('')}
        />
      )}

      {error && (
        <Feedback
          type="error"
          message={error}
          className="mb-4"
          onClose={() => setError('')}
        />
      )}

      {subjects.length === 0 && !loading && (
        <Feedback
          type="warning"
          message="You are not assigned to any subjects. Topics can only be created within assigned subjects."
          className="mb-4"
        />
      )}

      <Card>
        <CardHeader style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search topic or course code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={16} style={{ color: 'var(--text-muted)' }} />
                <select
                  value={selectedSubjectFilter}
                  onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                  className="form-select"
                  style={{ minWidth: '180px' }}
                >
                  <option value="">All Subjects</option>
                  {subjects.map((s) => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.code} – {s.name}
                    </option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Total: <strong>{filteredTopics.length}</strong> {filteredTopics.length === 1 ? 'topic' : 'topics'}
            </div>
          </div>
        </CardHeader>

        <CardBody style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
              <LoadingSpinner size={32} text="Loading topics..." />
            </div>
          ) : filteredTopics.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Layers size={40} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No topics found.</p>
              {(searchTerm || selectedSubjectFilter) ? (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                  Try adjusting your search query or filter.
                </p>
              ) : subjects.length > 0 ? (
                <div style={{ marginTop: '1rem' }}>
                  <Button variant="secondary" onClick={() => handleOpenModal()}>
                    Create your first topic
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th style={{ width: '80px' }}>ID</Th>
                  <Th>Topic Name</Th>
                  <Th>Subject</Th>
                  <Th style={{ width: '150px' }}>Course Code</Th>
                  <Th style={{ width: '180px', textAlign: 'center' }}>Approved Questions</Th>
                  <Th style={{ width: '120px', textAlign: 'right' }}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredTopics.map((topic) => {
                  const subj = topic.subject_id ? subjectMap.get(Number(topic.subject_id)) : null;
                  const approvedCount = approvedCounts.get(Number(topic.topic_id)) ?? 0;

                  return (
                    <Tr key={topic.topic_id}>
                      <Td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                        #{topic.topic_id}
                      </Td>
                      <Td>
                        <strong style={{ fontSize: '0.95rem' }}>{topic.name}</strong>
                      </Td>
                      <Td>
                        {subj ? (
                          <span>
                            <span style={{ fontWeight: 600 }}>{subj.code}</span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>– {subj.name}</span>
                          </span>
                        ) : topic.subject_id ? (
                          <span style={{ color: 'var(--text-muted)' }}>Subject #{topic.subject_id}</span>
                        ) : (
                          <Badge type="neutral">Unassigned</Badge>
                        )}
                      </Td>
                      <Td>
                        {topic.course_id ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{topic.course_id}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </Td>
                      <Td style={{ textAlign: 'center' }}>
                        <Badge type={approvedCount > 0 ? 'success' : 'neutral'}>
                          {approvedCount} approved
                        </Badge>
                      </Td>
                      <Td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon"
                            title="Edit Topic"
                            onClick={() => handleOpenModal(topic)}
                            aria-label={`Edit ${topic.name}`}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon"
                            title="Delete Topic"
                            onClick={() => handleOpenDelete(topic)}
                            aria-label={`Delete ${topic.name}`}
                            style={{ color: 'var(--accent)' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Add / Edit Topic Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={currentTopic ? 'Edit Topic' : 'Create Topic'}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {formError && (
              <Feedback type="error" message={formError} />
            )}

            <Input
              label="Topic Name *"
              placeholder="e.g. Object Oriented Programming Concepts"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              autoFocus
            />

            <div className="form-group">
              <label className="form-label" htmlFor="topic-subject-select">
                Subject *
              </label>
              <select
                id="topic-subject-select"
                className="form-select"
                value={formData.subject_id}
                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                required
              >
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.code} – {s.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Course Code (Optional)"
              placeholder="e.g. PRN211"
              value={formData.course_id}
              onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button variant="secondary" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {currentTopic ? 'Save Changes' : 'Create Topic'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={handleCloseDelete}
        title="Delete Topic"
      >
        <div className="modal-body">
          {deleteError ? (
            <Feedback type="error" message={deleteError} className="mb-4" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <AlertTriangle size={24} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  Are you sure you want to delete topic <strong>{deleteTarget?.name}</strong>?
                </p>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  This action cannot be undone. Topics with associated questions, materials, or exams cannot be deleted.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={handleCloseDelete} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' }}
            onClick={handleConfirmDelete}
            isLoading={isDeleting}
          >
            Delete Topic
          </Button>
        </div>
      </Modal>
    </div>
  );
}
