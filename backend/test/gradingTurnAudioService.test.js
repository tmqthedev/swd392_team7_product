const test = require('node:test');
const assert = require('node:assert/strict');
const { GradingService } = require('../src/services/gradingService');

// Turn audio playback must be subject-scoped like the result detail: a lecturer
// outside the exam's subject must not be able to fetch a student's answer audio
// by guessing qa_turn ids.
function setup({ turn } = {}) {
  const assignedLecturers = new Set([20]);
  const queries = [];
  const db = {
    async query(sql, params = []) {
      queries.push(sql);
      if (sql.includes('FROM qa_turn qt')) {
        return { rows: turn && Number(params[0]) === turn.qa_turn_id ? [turn] : [] };
      }
      if (sql.includes('FROM exam_session es')) {
        return { rows: [{ subject_id: 1 }] };
      }
      if (sql.includes('FROM subject_lecturer')) {
        return { rows: assignedLecturers.has(params[1]) ? [{ ok: 1 }] : [] };
      }
      return { rows: [] };
    },
  };
  const gradingService = new GradingService({
    db,
    vivaResultRepository: {},
    logger: { info() {}, error() {}, warn() {} },
  });
  return { gradingService, queries };
}

const TURN = {
  qa_turn_id: 7,
  exam_session_id: 42,
  answer_audio_key: 'interviews/1/turns/7/answer.webm',
  question_audio_key: 'tts/q7.mp3',
};

test('getTurnAudioKey returns the answer audio key for an in-scope lecturer', async () => {
  const { gradingService } = setup({ turn: TURN });
  const key = await gradingService.getTurnAudioKey({ turnId: 7, user: { id: 20, role: 'LECTURER' } });
  assert.equal(key, TURN.answer_audio_key);
});

test('getTurnAudioKey lets ADMIN through and falls back to the question audio', async () => {
  const { gradingService } = setup({ turn: { ...TURN, answer_audio_key: null } });
  const key = await gradingService.getTurnAudioKey({ turnId: 7, user: { id: 1, role: 'ADMIN' } });
  assert.equal(key, TURN.question_audio_key);
});

test('getTurnAudioKey denies a lecturer outside the subject with 403', async () => {
  const { gradingService } = setup({ turn: TURN });
  await assert.rejects(
    gradingService.getTurnAudioKey({ turnId: 7, user: { id: 99, role: 'LECTURER' } }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
});

test('getTurnAudioKey returns 404 for an unknown turn before any scope lookup', async () => {
  const { gradingService, queries } = setup({ turn: TURN });
  await assert.rejects(
    gradingService.getTurnAudioKey({ turnId: 8, user: { id: 99, role: 'LECTURER' } }),
    (err) => err.statusCode === 404,
  );
  assert.equal(queries.length, 1);
});

test('getTurnAudioKey returns 404 when the turn has no audio', async () => {
  const { gradingService } = setup({ turn: { ...TURN, answer_audio_key: null, question_audio_key: null } });
  await assert.rejects(
    gradingService.getTurnAudioKey({ turnId: 7, user: { id: 20, role: 'LECTURER' } }),
    (err) => err.statusCode === 404,
  );
});
