import { SLOT_STATUS } from '../../../constants/enums';
import { store } from '../../../data/mockStore';
import { clone, wait } from '../../../services/mockClient';

export async function getEvaluation(slotId) {
  await wait();
  const evaluation = store.evaluations[slotId];
  if (!evaluation) throw new Error('Evaluation not found.');
  return clone(evaluation);
}

function sumScores(criteria, field) {
  return criteria.reduce((sum, item) => sum + Number(item[field] ?? 0), 0);
}

export async function saveLecturerScores(slotId, { criteriaScores, lecturerReason }) {
  await wait();
  const evaluation = store.evaluations[slotId];
  if (!evaluation) throw new Error('Evaluation not found.');

  const reason = (lecturerReason || '').trim();
  if (!reason) throw new Error('Enter a reason when changing the AI suggestion.');

  evaluation.criteriaScores = evaluation.criteriaScores.map((item) => {
    const next = criteriaScores.find((row) => row.criterionId === item.criterionId);
    const lecturerScore = next ? Number(next.lecturerScore) : item.lecturerScore;
    return { ...item, lecturerScore };
  });

  if (evaluation.criteriaScores.some((item) => item.lecturerScore == null || Number.isNaN(item.lecturerScore))) {
    throw new Error('Enter a lecturer score for every criterion.');
  }

  evaluation.lecturerOverall = Number(sumScores(evaluation.criteriaScores, 'lecturerScore').toFixed(1));
  evaluation.lecturerReason = reason;
  evaluation.status = SLOT_STATUS.PENDING_REVIEW;

  const session = store.sessions.find((item) => item.id === slotId);
  if (session) session.lecturerScore = evaluation.lecturerOverall;

  return clone(evaluation);
}

export async function finalizeEvaluation(slotId, { useAiScores = false, lecturerReason = '' } = {}) {
  await wait();
  const evaluation = store.evaluations[slotId];
  if (!evaluation) throw new Error('Evaluation not found.');

  if (useAiScores) {
    evaluation.criteriaScores = evaluation.criteriaScores.map((item) => ({
      ...item,
      lecturerScore: item.aiScore,
    }));
    evaluation.lecturerOverall = evaluation.aiOverall;
    evaluation.lecturerReason = lecturerReason.trim() || 'Approved AI suggestion without change.';
  } else {
    if (evaluation.lecturerOverall == null) {
      throw new Error('Save an adjusted score before finalizing, or approve the AI score.');
    }
    if (!evaluation.lecturerReason.trim()) {
      throw new Error('Enter a reason before finalizing an adjusted score.');
    }
  }

  evaluation.status = SLOT_STATUS.APPROVED;
  const session = store.sessions.find((item) => item.id === slotId);
  if (session) {
    session.status = SLOT_STATUS.APPROVED;
    session.lecturerScore = evaluation.lecturerOverall;
  }

  return clone(evaluation);
}
