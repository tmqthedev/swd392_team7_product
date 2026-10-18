import { GENERATION_STATUS, QUESTION_SOURCE, QUESTION_STATUS } from '../../../constants/enums';
import {
  findTopic,
  nextQuestionId,
  nextRequestId,
  store,
} from '../../../data/mockStore';
import { clone, wait } from '../../../services/mockClient';

const SAMPLE_STEMS = {
  remember: 'Define',
  understand: 'Explain',
  apply: 'Show how you would apply',
  analyze: 'Compare and analyse',
};

export async function createGenerationRequest(payload) {
  await wait();
  const count = Number(payload.count) || 3;
  if (count < 1 || count > 8) throw new Error('Generate between 1 and 8 questions.');
  if (!payload.courseId || !payload.topicId) throw new Error('Select a course and topic.');
  if (!payload.bloomLevel) throw new Error('Select a Bloom level.');

  const request = {
    id: nextRequestId(),
    status: GENERATION_STATUS.PENDING,
    courseId: payload.courseId,
    topicId: payload.topicId,
    bloomLevel: payload.bloomLevel,
    count,
    createdAt: Date.now(),
    questionIds: [],
    duplicateCount: 0,
    error: null,
  };
  store.generationRequests = [request, ...store.generationRequests];

  // Mock xử lý nền: request accepted ngay, câu hỏi pending_review sau vài giây.
  window.setTimeout(() => completeGeneration(request.id), 2200);
  return clone(request);
}

function completeGeneration(requestId) {
  const request = store.generationRequests.find((item) => item.id === requestId);
  if (!request) return;

  request.status = GENERATION_STATUS.PROCESSING;
  const topic = findTopic(request.topicId);
  const material = store.materials.find((item) => item.topicId === request.topicId) || store.materials[0];
  const stem = SAMPLE_STEMS[request.bloomLevel] || 'Explain';
  let duplicateCount = 0;

  for (let index = 0; index < request.count; index += 1) {
    const content = `${stem} a key idea in ${topic?.name || 'this topic'} (generated item ${index + 1}).`;
    const exists = store.questions.some(
      (question) => question.content.toLowerCase() === content.toLowerCase()
    );
    if (exists) {
      duplicateCount += 1;
      continue;
    }

    const question = {
      id: nextQuestionId(),
      content,
      status: QUESTION_STATUS.PENDING_REVIEW,
      source: QUESTION_SOURCE.AI,
      bloomLevel: request.bloomLevel,
      topicId: request.topicId,
      courseId: request.courseId,
      rubricId: null,
      citation: material
        ? {
            materialId: material.id,
            materialTitle: material.title,
            excerpt: material.excerpt,
          }
        : null,
      rejectReason: null,
    };
    store.questions.unshift(question);
    request.questionIds.push(question.id);
  }

  request.duplicateCount = duplicateCount;
  request.status = GENERATION_STATUS.COMPLETED;
}

export async function getGenerationRequest(id) {
  await wait(120);
  const request = store.generationRequests.find((item) => item.id === id);
  if (!request) throw new Error('Generation request not found.');
  return clone(request);
}

export async function listActiveGenerationRequests() {
  await wait(80);
  return clone(
    store.generationRequests.filter(
      (item) => item.status === GENERATION_STATUS.PENDING || item.status === GENERATION_STATUS.PROCESSING
    )
  );
}
