import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, Search, Sparkles, Upload } from 'lucide-react';
import Modal from '../../../shared/components/Modal';
import { Button } from '../../../shared/components/Button';
import { Badge } from '../../../shared/components/Badge';
import { Card } from '../../../shared/components/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../../shared/components/Table';
import { Feedback } from '../../../shared/components/Feedback';
import { LoadingSpinner } from '../../../shared/components/Loading';
import { EmptyState } from '../../../shared/components/EmptyState';
import {
  BLOOM_LABEL,
  BLOOM_LEVELS,
  GENERATION_STATUS,
  QUESTION_SOURCE_LABEL,
  QUESTION_STATUS,
  QUESTION_STATUS_LABEL,
} from '../../../constants/enums';
import { listCourses, listTopics } from '../services/catalogService';
import {
  approveQuestion,
  createQuestion,
  deleteQuestion,
  importQuestions,
  listQuestions,
  rejectQuestion,
  updateQuestion,
} from '../services/questionService';
import { createGenerationRequest, getGenerationRequest } from '../services/generationService';
import { listRubrics } from '../../rubric/services/rubricService';
import './index.scss';

function statusBadge(status) {
  if (status === QUESTION_STATUS.APPROVED) return 'success';
  if (status === QUESTION_STATUS.REJECTED) return 'error';
  return 'warning';
}

const emptyForm = {
  content: '',
  bloomLevel: 'understand',
  topicId: '',
  courseId: '',
};

export default function LecturerQuestions() {
  const [questions, setQuestions] = useState([]);
  const [pendingReview, setPendingReview] = useState([]);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bloomFilter, setBloomFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({ courseId: '', topicId: '', bloomLevel: 'understand', count: 3 });
  const [generateError, setGenerateError] = useState('');
  const [activeRequest, setActiveRequest] = useState(null);

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewMode, setReviewMode] = useState(null);
  const [reviewRubricId, setReviewRubricId] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewError, setReviewError] = useState('');

  const [importNotice, setImportNotice] = useState(null);
  const fileInputRef = useRef(null);

  const loadQuestions = useCallback(async () => {
    const [rows, pending] = await Promise.all([
      listQuestions({
        search: searchTerm,
        status: statusFilter,
        bloomLevel: bloomFilter,
        topicId: topicFilter,
      }),
      listQuestions({ status: QUESTION_STATUS.PENDING_REVIEW }),
    ]);
    setQuestions(rows);
    setPendingReview(pending);
  }, [searchTerm, statusFilter, bloomFilter, topicFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [courseRows, topicRows, rubricRows] = await Promise.all([
          listCourses(),
          listTopics(),
          listRubrics(),
        ]);
        if (cancelled) return;
        setCourses(courseRows);
        setTopics(topicRows);
        setRubrics(rubricRows);
      } catch (error) {
        if (!cancelled) setPageError(error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadQuestions()
      .catch((error) => {
        if (!cancelled) setPageError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadQuestions]);

  useEffect(() => {
    if (!activeRequest?.id) return undefined;
    if (activeRequest.status === GENERATION_STATUS.COMPLETED || activeRequest.status === GENERATION_STATUS.FAILED) {
      return undefined;
    }

    const timer = setInterval(async () => {
      try {
        const next = await getGenerationRequest(activeRequest.id);
        setActiveRequest(next);
        if (next.status === GENERATION_STATUS.COMPLETED || next.status === GENERATION_STATUS.FAILED) {
          await loadQuestions();
        }
      } catch (error) {
        setPageError(error.message);
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [activeRequest, loadQuestions]);

  const topicsForCourse = topics.filter((topic) => !generateForm.courseId || topic.courseId === generateForm.courseId);
  const formTopics = topics.filter((topic) => !formData.courseId || topic.courseId === formData.courseId);
  const filtersActive = searchTerm.trim() !== '' || statusFilter !== 'all' || bloomFilter !== 'all' || topicFilter !== 'all';

  const handleOpenModal = (question = null) => {
    setCurrentQuestion(question);
    setFormData(
      question
        ? {
            content: question.content,
            bloomLevel: question.bloomLevel || 'understand',
            topicId: question.topicId || '',
            courseId: question.courseId || '',
          }
        : emptyForm
    );
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...formData,
        topicId: formData.topicId || null,
        courseId: formData.courseId || null,
      };
      if (currentQuestion) {
        await updateQuestion(currentQuestion.id, payload);
      } else {
        await createQuestion(payload);
      }
      setIsFormOpen(false);
      await loadQuestions();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await deleteQuestion(id);
      await loadQuestions();
    } catch (error) {
      setPageError(error.message);
    }
  };

  const handleGenerate = async () => {
    setGenerateError('');
    try {
      const request = await createGenerationRequest(generateForm);
      setActiveRequest(request);
      setIsGenerateOpen(false);
    } catch (error) {
      setGenerateError(error.message);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importQuestions(text);
      setImportNotice(
        `Imported ${result.created.length} question(s) for review${result.skipped.length ? `, skipped ${result.skipped.length} duplicate(s)` : ''}.`
      );
      await loadQuestions();
    } catch (error) {
      setPageError(error.message);
    }
  };

  const openReview = (question, mode) => {
    setReviewTarget(question);
    setReviewMode(mode);
    setReviewRubricId(question.rubricId || rubrics[0]?.id || '');
    setReviewReason('');
    setReviewError('');
  };

  const submitReview = async () => {
    setReviewError('');
    try {
      if (reviewMode === 'approve') {
        await approveQuestion(reviewTarget.id, reviewRubricId);
      } else {
        await rejectQuestion(reviewTarget.id, reviewReason);
      }
      setReviewTarget(null);
      await loadQuestions();
    } catch (error) {
      setReviewError(error.message);
    }
  };

  return (
    <div className="questions-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Question bank</p>
          <h1>Questions</h1>
          <p>Write, import, or generate prompts. AI items stay in review until you approve them with a rubric.</p>
        </div>
        <div className="header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            className="sr-only"
            onChange={handleImportFile}
          />
          <Button variant="secondary" icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
          <Button variant="secondary" icon={<Sparkles size={16} />} onClick={() => setIsGenerateOpen(true)}>
            Generate with AI
          </Button>
          <Button onClick={() => handleOpenModal()} icon={<Plus size={16} />}>
            Add question
          </Button>
        </div>
      </header>

      {pageError && <Feedback type="error" message={pageError} />}
      {importNotice && <Feedback type="success" message={importNotice} />}
      {activeRequest && activeRequest.status !== GENERATION_STATUS.COMPLETED && (
        <Feedback
          type="info"
          title="Generation in progress"
          message="The request was accepted. New questions will appear in pending review when processing finishes."
        />
      )}
      {activeRequest?.status === GENERATION_STATUS.COMPLETED && (
        <Feedback
          type="success"
          title="Generation finished"
          message={`${activeRequest.questionIds.length} question(s) added for review${activeRequest.duplicateCount ? `, ${activeRequest.duplicateCount} duplicate(s) skipped` : ''}.`}
        />
      )}

      {pendingReview.length > 0 && (
        <section className="review-queue-panel" aria-labelledby="pending-heading">
          <div className="section-heading">
            <h2 id="pending-heading">Pending review</h2>
            <span>{pendingReview.length} item(s)</span>
          </div>
          <ul className="review-cards">
            {pendingReview.map((question) => (
              <li key={question.id}>
                <div>
                  <div className="review-card-head">
                    <strong>{question.id}</strong>
                    <Badge type="warning">{QUESTION_STATUS_LABEL[question.status] || 'Pending review'}</Badge>
                  </div>
                  <p>{question.content}</p>
                  <p className="citation-line">
                    {QUESTION_SOURCE_LABEL[question.source] || question.source}
                    {question.bloomLevel ? ` · ${BLOOM_LABEL[question.bloomLevel]}` : ''}
                  </p>
                  {question.citation && (
                    <p className="citation-line">
                      Material: {question.citation.materialTitle} — {question.citation.excerpt}
                    </p>
                  )}
                </div>
                <div className="row-actions">
                  <Button variant="secondary" onClick={() => handleOpenModal(question)}>Edit</Button>
                  <Button variant="secondary" onClick={() => openReview(question, 'reject')}>Reject</Button>
                  <Button onClick={() => openReview(question, 'approve')}>Approve</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="is-flush">
        <div className="panel-toolbar">
          <div className="filters-row">
            <label className="filter-field search-field">
              <span>Search</span>
              <span className="search-control">
                <Search size={16} aria-hidden="true" />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Question text or ID"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </span>
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select className="form-select filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {Object.values(QUESTION_STATUS).map((status) => (
                  <option key={status} value={status}>{QUESTION_STATUS_LABEL[status]}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Bloom</span>
              <select className="form-select filter-select" value={bloomFilter} onChange={(e) => setBloomFilter(e.target.value)}>
                <option value="all">All levels</option>
                {BLOOM_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Topic</span>
              <select className="form-select filter-select" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="all">All topics</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
            </label>
          </div>
          {filtersActive && (
            <p className="result-count">{questions.length} question(s) match.</p>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <LoadingSpinner text="Loading questions..." />
          </div>
        ) : questions.length === 0 ? (
          <EmptyState
            title="No questions found"
            actions={(
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setBloomFilter('all');
                  setTopicFilter('all');
                }}
              >
                Clear filters
              </Button>
            )}
          >
            <p>Add, import, or generate a question for this filter.</p>
          </EmptyState>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>ID</Th>
                <Th>Question</Th>
                <Th>Topic</Th>
                <Th>Bloom</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th>Rubric</Th>
                <Th className="cell-actions">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {questions.map((question) => (
                <Tr key={question.id}>
                  <Td><strong>{question.id}</strong></Td>
                  <Td className="question-cell">
                    {question.content}
                    {question.citation && (
                      <div className="table-meta">Cited: {question.citation.materialTitle}</div>
                    )}
                    {question.rejectReason && (
                      <div className="table-meta">Rejected: {question.rejectReason}</div>
                    )}
                  </Td>
                  <Td>{question.topicName || '—'}</Td>
                  <Td>{BLOOM_LABEL[question.bloomLevel] || '—'}</Td>
                  <Td>{QUESTION_SOURCE_LABEL[question.source] || question.source}</Td>
                  <Td>
                    <Badge type={statusBadge(question.status)}>{QUESTION_STATUS_LABEL[question.status]}</Badge>
                  </Td>
                  <Td>
                    {question.rubricId ? <Badge type="info">{question.rubricName}</Badge> : <span className="table-meta">None</span>}
                  </Td>
                  <Td className="cell-actions">
                    <div className="row-actions">
                      <Button variant="secondary" className="btn-icon" onClick={() => handleOpenModal(question)} aria-label={`Edit ${question.id}`}>
                        <Edit2 size={15} />
                      </Button>
                      <Button variant="secondary" className="btn-icon" onClick={() => handleDelete(question.id)} aria-label={`Delete ${question.id}`}>
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

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={currentQuestion ? 'Edit Question' : 'Create Question'}>
        <div className="modal-body">
          {formError && <Feedback type="error" message={formError} />}
          <div className="form-group">
            <label className="form-label" htmlFor="question-content">Question Content</label>
            <textarea
              id="question-content"
              className="form-textarea"
              rows={4}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="question-course">Course</label>
              <select
                id="question-course"
                className="form-select"
                value={formData.courseId}
                onChange={(e) => setFormData({ ...formData, courseId: e.target.value, topicId: '' })}
              >
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="question-topic">Topic</label>
              <select
                id="question-topic"
                className="form-select"
                value={formData.topicId}
                onChange={(e) => setFormData({ ...formData, topicId: e.target.value })}
              >
                <option value="">Select topic</option>
                {formTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="question-bloom">Bloom level</label>
            <select
              id="question-bloom"
              className="form-select"
              value={formData.bloomLevel}
              onChange={(e) => setFormData({ ...formData, bloomLevel: e.target.value })}
            >
              {BLOOM_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => setIsFormOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} isLoading={saving}>Save</Button>
        </div>
      </Modal>

      <Modal isOpen={isGenerateOpen} onClose={() => setIsGenerateOpen(false)} title="Generate questions with AI">
        <div className="modal-body">
          {generateError && <Feedback type="error" message={generateError} />}
          <p className="form-hint">The backend will accept this request immediately and process it in the background.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="gen-course">Course</label>
            <select
              id="gen-course"
              className="form-select"
              value={generateForm.courseId}
              onChange={(e) => setGenerateForm({ ...generateForm, courseId: e.target.value, topicId: '' })}
            >
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="gen-topic">Topic</label>
            <select
              id="gen-topic"
              className="form-select"
              value={generateForm.topicId}
              onChange={(e) => setGenerateForm({ ...generateForm, topicId: e.target.value })}
            >
              <option value="">Select topic</option>
              {topicsForCourse.map((topic) => (
                <option key={topic.id} value={topic.id}>{topic.name}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="gen-bloom">Bloom level</label>
              <select
                id="gen-bloom"
                className="form-select"
                value={generateForm.bloomLevel}
                onChange={(e) => setGenerateForm({ ...generateForm, bloomLevel: e.target.value })}
              >
                {BLOOM_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="gen-count">Number of questions</label>
              <input
                id="gen-count"
                type="number"
                min="1"
                max="8"
                className="form-input"
                value={generateForm.count}
                onChange={(e) => setGenerateForm({ ...generateForm, count: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => setIsGenerateOpen(false)}>Cancel</Button>
          <Button onClick={handleGenerate}>Send generation request</Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={reviewMode === 'approve' ? 'Approve question' : 'Reject question'}
      >
        <div className="modal-body">
          {reviewError && <Feedback type="error" message={reviewError} />}
          <p>{reviewTarget?.content}</p>
          {reviewMode === 'approve' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="review-rubric">Rubric</label>
              <select
                id="review-rubric"
                className="form-select"
                value={reviewRubricId}
                onChange={(e) => setReviewRubricId(e.target.value)}
              >
                {rubrics.map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>{rubric.name} ({rubric.maxScore} pts)</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="review-reason">Rejection reason</label>
              <textarea
                id="review-reason"
                className="form-textarea"
                rows={3}
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => setReviewTarget(null)}>Cancel</Button>
          <Button variant={reviewMode === 'reject' ? 'danger' : 'primary'} onClick={submitReview}>
            {reviewMode === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
