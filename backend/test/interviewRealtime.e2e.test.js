const http = require('http');
const request = require('supertest');
const pino = require('pino');
const { io: Client } = require('socket.io-client');
const { createApp } = require('../src/app');
const { buildWorld, STUDENT, OTHER_STUDENT, EXAM_ID } = require('./helpers/interviewFakes');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');

describe('AIVES Realtime Viva Interview Transport (Step 7)', () => {
  let world;
  let app;
  let server;
  let port;
  let studentCookie;
  let otherStudentCookie;
  let lecturerCookie;
  let createdInterviewId;

  beforeAll((done) => {
    world = buildWorld({
      exam: {
        title: 'Network Systems Viva',
        main_question_count: 2,
        max_follow_ups_per_question: 1,
      },
      approvedCount: 4,
    });

    // Mock student exam listing in fake DB repo
    world.db.examSessionRepository.listByStudent = async (studentId) => {
      if (Number(studentId) === STUDENT.id) {
        return [
          {
            exam_session_id: EXAM_ID,
            title: 'Network Systems Viva',
            subject_name: 'Networking',
            subject_code: 'NET101',
            topic_name: 'Transport Layer',
            language: 'EN',
            main_question_count: 2,
            max_follow_ups_per_question: 1,
            answer_time_limit_sec: 120,
            think_time_sec: 5,
            session_time_limit_sec: 1800,
            opens_at: null,
            closes_at: null,
            status: 'OPEN',
            viva_interview_id: null,
            interview_status: null,
            interview_started_at: null,
            interview_deadline_at: null,
          },
        ];
      }
      return [];
    };

    app = createApp({
      env: { awsMockMode: true, dbMockMode: true },
      logger: pino({ level: 'silent' }),
      examSessionRepository: world.db.examSessionRepository,
      vivaInterviewRepository: world.db.vivaInterviewRepository,
      assignedQuestionRepository: world.db.assignedQuestionRepository,
      qaTurnRepository: world.db.qaTurnRepository,
      transcriptRepository: world.db.transcriptRepository,
      processingFailureRepository: world.db.processingFailureRepository,
      vivaResultRepository: world.db.vivaResultRepository,
      questionRepository: world.db.questionRepository,
      questionSourceRefRepository: world.db.questionSourceRefRepository,
      rubricRepository: world.db.rubricRepository,
      sessionContextStore: world.sessionContextStore,
      sttAdapter: world.stt,
      ttsAdapter: world.tts,
      llmAdapter: world.llm,
      awsClients: world.s3,
      enqueueJob: world.enqueueJob,
      clock: world.clock,
      interviewService: world.service,
    });

    server = http.createServer(app);
    app.attachRealtime(server);

    server.listen(0, () => {
      port = server.address().port;
      const tokenService = app.authContext.tokenService;
      studentCookie = `${ACCESS_COOKIE}=${tokenService.signAccess({ sub: STUDENT.id, role: 'STUDENT' }).token}`;
      otherStudentCookie = `${ACCESS_COOKIE}=${tokenService.signAccess({ sub: OTHER_STUDENT.id, role: 'STUDENT' }).token}`;
      lecturerCookie = `${ACCESS_COOKIE}=${tokenService.signAccess({ sub: 1, role: 'LECTURER' }).token}`;
      done();
    });
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('REST Endpoints: /api/me/exam-sessions & /api/interviews', () => {
    test('GET /api/me/exam-sessions requires STUDENT role', async () => {
      // 401 without cookie
      const unauth = await request(app).get('/api/me/exam-sessions');
      expect(unauth.status).toBe(401);

      // 403 for LECTURER
      const forbidden = await request(app)
        .get('/api/me/exam-sessions')
        .set('Cookie', lecturerCookie);
      expect(forbidden.status).toBe(403);

      // 200 for STUDENT
      const ok = await request(app)
        .get('/api/me/exam-sessions')
        .set('Cookie', studentCookie);
      expect(ok.status).toBe(200);
      expect(Array.isArray(ok.body)).toBe(true);
      expect(ok.body.length).toBe(1);
      expect(ok.body[0].title).toBe('Network Systems Viva');
      expect(ok.body[0].canStart).toBe(true);
    });

    test('POST /api/interviews starts or resumes viva interview', async () => {
      const res = await request(app)
        .post('/api/interviews')
        .set('Cookie', studentCookie)
        .send({ examSessionId: EXAM_ID });

      expect(res.status).toBe(200);
      expect(res.body.interviewId).toBeDefined();
      createdInterviewId = res.body.interviewId;
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.currentTurn).toBeDefined();
      expect(res.body.currentTurn.turnType).toBe('MAIN');
      expect(res.body.currentTurn.status).toBe('ASKED');

      // Student safety: forbidden internal details must never be exposed
      expect(res.body.currentTurn.rationale).toBeUndefined();
      expect(res.body.currentTurn.referenceAnswer).toBeUndefined();
      expect(res.body.currentTurn.keyPoints).toBeUndefined();
    });

    test('GET /api/interviews/:id returns student-safe current state', async () => {
      const res = await request(app)
        .get(`/api/interviews/${createdInterviewId}`)
        .set('Cookie', studentCookie);

      expect(res.status).toBe(200);
      expect(res.body.interviewId).toBe(createdInterviewId);
      expect(res.body.status).toBe('IN_PROGRESS');
    });
  });

  describe('Socket.IO Real-time Interview Transport: /interview', () => {
    let socket;
    let interviewId;

    beforeAll(() => {
      interviewId = createdInterviewId;
    });

    afterEach(() => {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    });

    test('Socket connects with student cookie and executes interview flow', async () => {
      socket = Client(`http://localhost:${port}/interview`, {
        transports: ['websocket'],
        extraHeaders: {
          cookie: studentCookie,
        },
      });

      await new Promise((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
      });

      // Step 1: Join interview
      const joinRes = await new Promise((resolve) => {
        socket.emit('interview:join', { interviewId }, resolve);
      });
      expect(joinRes.ok).toBe(true);
      expect(joinRes.state.interviewId).toBe(interviewId);

      // Step 2: Signal ready after mic test -> receive question:new
      const qPromise = new Promise((resolve) => {
        socket.on('question:new', resolve);
      });
      socket.emit('interview:ready', { interviewId });
      const q = await qPromise;

      expect(q.turnId).toBeDefined();
      expect(q.language).toBe('EN');
      expect(q.questionText).toBeDefined();
      expect(q.thinkTimeSec).toBe(5);
      expect(q.answerTimeSec).toBe(120);

      // Step 3: Question played
      const playRes = await new Promise((resolve) => {
        socket.emit('question:played', { interviewId, turnId: q.turnId }, resolve);
      });
      expect(playRes.ok).toBe(true);
      expect(playRes.view.currentTurn.status).toBe('ANSWERING');

      // Step 4: Start answering & stream audio chunks
      socket.emit('answer:start', { interviewId, turnId: q.turnId });
      socket.emit('audio:chunk', {
        interviewId,
        turnId: q.turnId,
        chunk: Buffer.from('mock-audio-answer-data'),
      });

      // Step 5: Finish answering
      const endRes = await new Promise((resolve) => {
        socket.emit('answer:end', {
          interviewId,
          turnId: q.turnId,
          contentType: 'audio/webm',
          transcript: {
            text: 'TCP uses sequence numbers and acknowledgements for reliability.',
            words: [
              { word: 'TCP', start: 0.1, end: 0.4 },
              { word: 'uses', start: 0.5, end: 0.8 },
              { word: 'sequence', start: 0.9, end: 1.3 },
              { word: 'numbers', start: 1.4, end: 1.8 },
            ],
          },
        }, resolve);
      });

      expect(endRes.ok).toBe(true);
      expect(endRes.view).toBeDefined();
    });
  });

  test('repeated STT failures emit recoverable state and keep the same turn until a successful retry', async () => {
    const state = await world.service.startOrResume({ user: OTHER_STUDENT, examSessionId: EXAM_ID });
    const socket = Client(`http://localhost:${port}/interview`, {
      transports: ['websocket'], extraHeaders: { cookie: otherStudentCookie },
    });
    const original = world.stt.transcribe;
    try {
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      const emit = (event, data) => new Promise(resolve => socket.emit(event, data, resolve));
      const interviewId = state.interviewId;
      const turnId = state.currentTurn.turnId;
      await emit('interview:join', { interviewId });
      await emit('question:played', { interviewId, turnId });
      world.stt.transcribe = async () => { throw new Error('provider unavailable'); };
      for (let i = 0; i < 3; i += 1) {
        const retryEvent = new Promise(resolve => socket.once('turn:retry', resolve));
        await emit('answer:start', { interviewId, turnId });
        socket.emit('audio:chunk', { chunk: Buffer.from('speech') });
        const result = await emit('answer:end', { interviewId, turnId });
        expect(result.code).toBe('STT_FAILED');
        expect(await retryEvent).toMatchObject({ turnId, code: 'STT_FAILED', serviceFailure: true });
        const current = await world.service.getCurrentState({ user: OTHER_STUDENT, interviewId });
        expect(current.currentTurn.turnId).toBe(turnId);
        expect(current.currentTurn.status).toBe('ANSWERING');
      }
      world.stt.transcribe = async () => ({ text: 'TCP uses sequence numbers.', confidence: 0.9, words: [] });
      await emit('answer:start', { interviewId, turnId });
      socket.emit('audio:chunk', { chunk: Buffer.from('speech') });
      const success = await emit('answer:end', { interviewId, turnId });
      expect(success.ok).toBe(true);
      expect(success.view.currentTurn?.turnId).not.toBe(turnId);
    } finally {
      world.stt.transcribe = original;
      socket.disconnect();
    }
  });
});
