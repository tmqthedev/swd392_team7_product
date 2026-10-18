import { QUESTION_STATUS, TURN_TYPE } from '../../../constants/enums';
import { store } from '../../../data/mockStore';
import { clone, wait } from '../../../services/mockClient';

const ANSWER_LIMIT_SECONDS = 120;
const MAIN_QUESTION_LIMIT = 3;
const MAX_FOLLOW_UPS = 2;

const FOLLOW_UP_BANK = [
  {
    content: 'Can you give a concrete Java example to support that answer?',
    reason: 'Need a worked example to confirm application.',
  },
  {
    content: 'What would go wrong if that principle were ignored in a large codebase?',
    reason: 'Probe analysis of consequences.',
  },
];

let liveSession = null;

function approvedQuestions() {
  const fromBank = store.questions.filter((question) => question.status === QUESTION_STATUS.APPROVED);
  if (fromBank.length >= MAIN_QUESTION_LIMIT) return fromBank.slice(0, MAIN_QUESTION_LIMIT);
  return [
    { id: 'Q-DEMO-1', content: 'Explain the principles of Object-Oriented Programming (OOP) in Java.' },
    { id: 'Q-DEMO-2', content: 'How does encapsulation protect object state in a Java class?' },
    { id: 'Q-DEMO-3', content: 'When would you choose composition over inheritance?' },
  ];
}

export async function getVivaBrief() {
  await wait(80);
  return {
    examName: 'Java Programming Viva',
    mainQuestionLimit: MAIN_QUESTION_LIMIT,
    maxFollowUpsPerQuestion: MAX_FOLLOW_UPS,
    answerLimitSeconds: ANSWER_LIMIT_SECONDS,
  };
}

export async function startVivaSession() {
  await wait(400);
  const mains = approvedQuestions();
  liveSession = {
    sessionId: `SLOT-${Date.now()}`,
    examName: 'Java Programming Viva',
    mainQuestionLimit: MAIN_QUESTION_LIMIT,
    maxFollowUpsPerQuestion: MAX_FOLLOW_UPS,
    answerLimitSeconds: ANSWER_LIMIT_SECONDS,
    mainIndex: 0,
    followUpsUsed: 0,
    mains,
    turns: [],
  };

  return clone({
    ...publicState(),
    question: currentMainQuestion(),
  });
}

function currentMainQuestion() {
  const question = liveSession.mains[liveSession.mainIndex];
  return {
    id: question.id,
    content: question.content,
    type: TURN_TYPE.MAIN,
    followUpsUsed: liveSession.followUpsUsed,
    followUpsRemaining: MAX_FOLLOW_UPS - liveSession.followUpsUsed,
    mainIndex: liveSession.mainIndex + 1,
    mainTotal: liveSession.mains.length,
  };
}

function publicState() {
  return {
    sessionId: liveSession.sessionId,
    examName: liveSession.examName,
    mainQuestionLimit: liveSession.mainQuestionLimit,
    maxFollowUpsPerQuestion: liveSession.maxFollowUpsPerQuestion,
    answerLimitSeconds: liveSession.answerLimitSeconds,
    followUpsUsed: liveSession.followUpsUsed,
    followUpsRemaining: MAX_FOLLOW_UPS - liveSession.followUpsUsed,
    mainIndex: liveSession.mainIndex + 1,
    mainTotal: liveSession.mains.length,
  };
}

export async function submitVivaAnswer({ question, transcript, durationSeconds }) {
  await wait(900);
  if (!liveSession) throw new Error('No active viva session.');

  liveSession.turns.push({
    questionId: question.id,
    type: question.type,
    transcript: transcript || 'Simulated recorded answer text...',
    durationSeconds: durationSeconds || 0,
  });

  const shouldFollowUp =
    question.type === TURN_TYPE.MAIN && liveSession.followUpsUsed < MAX_FOLLOW_UPS && liveSession.mainIndex === 0;

  if (shouldFollowUp) {
    const follow = FOLLOW_UP_BANK[liveSession.followUpsUsed];
    liveSession.followUpsUsed += 1;
    return clone({
      completed: false,
      ...publicState(),
      question: {
        id: `${question.id}-F${liveSession.followUpsUsed}`,
        content: follow.content,
        type: TURN_TYPE.FOLLOW_UP,
        reason: follow.reason,
        followUpsUsed: liveSession.followUpsUsed,
        followUpsRemaining: MAX_FOLLOW_UPS - liveSession.followUpsUsed,
        mainIndex: liveSession.mainIndex + 1,
        mainTotal: liveSession.mains.length,
      },
    });
  }

  liveSession.mainIndex += 1;
  liveSession.followUpsUsed = 0;

  if (liveSession.mainIndex >= liveSession.mains.length) {
    return clone({ completed: true, ...publicState(), question: null, turns: liveSession.turns });
  }

  return clone({
    completed: false,
    ...publicState(),
    question: currentMainQuestion(),
  });
}

export async function endVivaSession() {
  await wait(200);
  const snapshot = liveSession ? clone({ completed: true, turns: liveSession.turns }) : { completed: true, turns: [] };
  liveSession = null;
  return snapshot;
}
