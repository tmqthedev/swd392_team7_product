import { findRubric, nextCriterionId, nextRubricId, rubricMaxScore, store } from '../../../data/mockStore';
import { clone, wait } from '../../../services/mockClient';

function withTotal(rubric) {
  return { ...rubric, maxScore: rubricMaxScore(rubric) };
}

export async function listRubrics() {
  await wait();
  return store.rubrics.map((rubric) => clone(withTotal(rubric)));
}

export async function getRubric(id) {
  await wait();
  const rubric = findRubric(id);
  if (!rubric) throw new Error('Rubric not found.');
  return clone(withTotal(rubric));
}

function normalizeCriteria(criteria) {
  const cleaned = (criteria || [])
    .map((item) => ({
      id: item.id || nextCriterionId(),
      name: String(item.name || '').trim(),
      maxScore: Number(item.maxScore),
    }))
    .filter((item) => item.name);

  if (cleaned.length === 0) throw new Error('Add at least one criterion.');
  if (cleaned.some((item) => !Number.isFinite(item.maxScore) || item.maxScore <= 0)) {
    throw new Error('Each criterion needs a max score greater than 0.');
  }
  return cleaned;
}

export async function saveRubric(payload) {
  await wait();
  const name = (payload.name || '').trim();
  if (!name) throw new Error('Rubric name cannot be empty.');
  const criteria = normalizeCriteria(payload.criteria);

  if (payload.id) {
    const index = store.rubrics.findIndex((rubric) => rubric.id === payload.id);
    if (index < 0) throw new Error('Rubric not found.');
    store.rubrics[index] = { id: payload.id, name, criteria };
    return clone(withTotal(store.rubrics[index]));
  }

  const rubric = { id: nextRubricId(), name, criteria };
  store.rubrics = [...store.rubrics, rubric];
  return clone(withTotal(rubric));
}

export async function deleteRubric(id) {
  await wait();
  const inUse = store.questions.some((question) => question.rubricId === id);
  if (inUse) throw new Error('This rubric is attached to a question and cannot be deleted.');
  store.rubrics = store.rubrics.filter((rubric) => rubric.id !== id);
}
