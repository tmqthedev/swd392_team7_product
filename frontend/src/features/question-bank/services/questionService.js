import { QUESTION_SOURCE, QUESTION_STATUS } from '../../../constants/enums';
import {
  findCourse,
  findRubric,
  findTopic,
  nextQuestionId,
  store,
} from '../../../data/mockStore';
import { clone, wait } from '../../../services/mockClient';

function withLabels(question) {
  const topic = findTopic(question.topicId);
  const course = findCourse(question.courseId);
  const rubric = findRubric(question.rubricId);
  return {
    ...question,
    topicName: topic?.name || null,
    courseName: course?.name || null,
    rubricName: rubric?.name || question.rubricId || null,
  };
}

export async function listQuestions(filters = {}) {
  await wait();
  const search = (filters.search || '').trim().toLowerCase();
  return store.questions
    .filter((question) => {
      const matchesSearch =
        !search ||
        question.content.toLowerCase().includes(search) ||
        question.id.toLowerCase().includes(search);
      const matchesStatus = !filters.status || filters.status === 'all' || question.status === filters.status;
      const matchesBloom = !filters.bloomLevel || filters.bloomLevel === 'all' || question.bloomLevel === filters.bloomLevel;
      const matchesTopic = !filters.topicId || filters.topicId === 'all' || question.topicId === filters.topicId;
      return matchesSearch && matchesStatus && matchesBloom && matchesTopic;
    })
    .map((question) => clone(withLabels(question)));
}

export async function countQuestions(status) {
  await wait(80);
  if (!status) return store.questions.length;
  return store.questions.filter((question) => question.status === status).length;
}

function assertUniqueContent(content, ignoreId) {
  const duplicate = store.questions.some(
    (question) =>
      question.content.toLowerCase().trim() === content.toLowerCase().trim() &&
      question.id !== ignoreId
  );
  if (duplicate) {
    const error = new Error('This question already exists.');
    error.code = 'DUPLICATE_QUESTION';
    throw error;
  }
}

export async function createQuestion(payload) {
  await wait();
  const content = payload.content.trim();
  if (!content) throw new Error('Question content cannot be empty.');
  assertUniqueContent(content);

  const question = {
    id: nextQuestionId(),
    content,
    status: payload.status || QUESTION_STATUS.APPROVED,
    source: payload.source || QUESTION_SOURCE.LECTURER,
    bloomLevel: payload.bloomLevel || 'understand',
    topicId: payload.topicId || null,
    courseId: payload.courseId || null,
    rubricId: payload.rubricId || null,
    citation: payload.citation || null,
    rejectReason: null,
  };
  store.questions = [question, ...store.questions];
  return clone(withLabels(question));
}

export async function updateQuestion(id, payload) {
  await wait();
  const index = store.questions.findIndex((question) => question.id === id);
  if (index < 0) throw new Error('Question not found.');

  const content = (payload.content ?? store.questions[index].content).trim();
  if (!content) throw new Error('Question content cannot be empty.');
  assertUniqueContent(content, id);

  store.questions[index] = {
    ...store.questions[index],
    ...payload,
    content,
  };
  return clone(withLabels(store.questions[index]));
}

export async function deleteQuestion(id) {
  await wait();
  store.questions = store.questions.filter((question) => question.id !== id);
}

export async function approveQuestion(id, rubricId) {
  await wait();
  if (!rubricId) throw new Error('Select a rubric before approving.');
  const rubric = findRubric(rubricId);
  if (!rubric) throw new Error('Rubric not found.');
  return updateQuestion(id, {
    status: QUESTION_STATUS.APPROVED,
    rubricId,
    rejectReason: null,
  });
}

export async function rejectQuestion(id, reason) {
  await wait();
  const trimmed = (reason || '').trim();
  if (!trimmed) throw new Error('Enter a rejection reason.');
  return updateQuestion(id, {
    status: QUESTION_STATUS.REJECTED,
    rejectReason: trimmed,
  });
}

export async function importQuestions(fileText, { topicId, courseId } = {}) {
  await wait(450);
  const lines = fileText
    .split(/\r?\n/)
    .map((line) => line.replace(/^"|"$/g, '').split(',')[0].trim())
    .filter(Boolean)
    .filter((line) => !/^content$/i.test(line));

  if (lines.length === 0) throw new Error('No questions found in this file.');

  const created = [];
  const skipped = [];
  lines.forEach((content) => {
    const exists = store.questions.some(
      (question) => question.content.toLowerCase().trim() === content.toLowerCase()
    );
    if (exists) {
      skipped.push(content);
      return;
    }
    const question = {
      id: nextQuestionId(),
      content,
      status: QUESTION_STATUS.PENDING_REVIEW,
      source: QUESTION_SOURCE.IMPORT,
      bloomLevel: 'understand',
      topicId: topicId || null,
      courseId: courseId || null,
      rubricId: null,
      citation: null,
      rejectReason: null,
    };
    store.questions.unshift(question);
    created.push(withLabels(question));
  });

  return clone({ created, skipped });
}
