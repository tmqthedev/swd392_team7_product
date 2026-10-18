import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { Badge } from '../../../shared/components/Badge';
import { Feedback } from '../../../shared/components/Feedback';
import { LoadingSpinner } from '../../../shared/components/Loading';
import { TURN_TYPE } from '../../../constants/enums';
import { endVivaSession, startVivaSession, submitVivaAnswer } from '../services/vivaService';
import {
  canUseSpeechRecognition,
  canUseSpeechSynthesis,
  createRecognizer,
  speakText,
  stopSpeaking,
} from '../../../shared/utils/speech';
import './session.scss';

function formatTime(secs) {
  const safe = Math.max(0, secs);
  const m = Math.floor(safe / 60).toString().padStart(2, '0');
  const s = (safe % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const AI_STATUS = {
  speaking: 'Speaking',
  listening: 'Listening',
  recording: 'Listening',
  thinking: 'Thinking',
};

export default function StudentVivaSession() {
  const [sessionState, setSessionState] = useState('ready');
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [transcriptLog, setTranscriptLog] = useState([]);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(0);
  const answerTextRef = useRef('');
  const recognizerRef = useRef(null);
  const streamRef = useRef(null);
  const submitLockRef = useRef(false);
  const submitAnswerRef = useRef(null);

  useEffect(() => () => {
    stopSpeaking();
    recognizerRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startMic = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSessionState('unsupported');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return stream;
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setSessionState('mic-denied');
      } else {
        setErrorMessage(error.message || 'Microphone is unavailable.');
        setSessionState('error');
      }
      return null;
    }
  };

  const speakQuestion = async (nextQuestion) => {
    setSessionState('speaking');
    await speakText(nextQuestion.content);
    setSessionState('listening');
  };

  const startSession = async () => {
    setSessionState('starting');
    setErrorMessage('');
    const stream = await startMic();
    if (!stream) return;

    try {
      const started = await startVivaSession();
      setSession(started);
      setQuestion(started.question);
      setTranscriptLog([]);
      await speakQuestion(started.question);
    } catch (error) {
      setErrorMessage(error.message);
      setSessionState('error');
    }
  };

  const stopRecognizer = () => {
    try {
      recognizerRef.current?.stop();
    } catch {
      // Một số trình duyệt throw khi recognizer chưa start.
    }
    recognizerRef.current = null;
  };

  const submitCurrentAnswer = async (transcript) => {
    if (submitLockRef.current || !question) return;
    submitLockRef.current = true;
    stopRecognizer();
    setSessionState('thinking');
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    const spoken = transcript || answerText || 'Simulated recorded answer text...';
    setAnswerText(spoken);
    setTranscriptLog((current) => [
      ...current,
      { question: question.content, answer: spoken, type: question.type },
    ]);

    try {
      const result = await submitVivaAnswer({
        question,
        transcript: spoken,
        durationSeconds,
      });
      setSession(result);
      if (result.completed) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        setSessionState('completed');
        return;
      }
      setQuestion(result.question);
      setAnswerText('');
      await speakQuestion(result.question);
    } catch (error) {
      setErrorMessage(error.message || 'The connection dropped while submitting your answer.');
      setSessionState('error');
    } finally {
      submitLockRef.current = false;
    }
  };

  useEffect(() => {
    submitAnswerRef.current = submitCurrentAnswer;
  });

  const beginRecording = () => {
    if (sessionState !== 'listening') return;
    submitLockRef.current = false;
    startedAtRef.current = Date.now();
    answerTextRef.current = '';
    const limit = session?.answerLimitSeconds || 120;
    remainingRef.current = limit;
    setRemaining(limit);
    setAnswerText('');
    setSessionState('recording');

    if (canUseSpeechRecognition()) {
      const recognizer = createRecognizer({
        onResult: (text) => {
          answerTextRef.current = text;
          setAnswerText(text);
        },
      });
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
      } catch {
        setAnswerText('');
      }
    }
  };

  const stopAndSubmit = () => {
    if (sessionState !== 'recording') return;
    submitCurrentAnswer(answerTextRef.current);
  };

  useEffect(() => {
    if (sessionState !== 'recording') return undefined;
    const timer = setInterval(() => {
      remainingRef.current -= 1;
      setRemaining(remainingRef.current);
      if (remainingRef.current <= 0) {
        clearInterval(timer);
        submitAnswerRef.current?.(answerTextRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionState]);

  const handleEnd = async () => {
    if (!confirm('End this examination now? Unanswered questions will not be recorded.')) return;
    stopSpeaking();
    stopRecognizer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    await endVivaSession();
    setSessionState('completed');
  };

  const retryConnection = () => {
    setErrorMessage('');
    setSessionState('listening');
  };

  if (sessionState === 'ready') {
    return (
      <div className="viva-shell">
        <div className="examiner-panel is-ready" aria-hidden="true">
          <div className="examiner-avatar">AI</div>
          <p className="examiner-label">Virtual examiner</p>
          <p className="viva-status">Ready</p>
        </div>
        <p className="page-kicker">Oral examination</p>
        <h1>Java Programming Viva</h1>
        <p className="viva-lead">
          The examiner asks a main question aloud. You record a spoken answer within two minutes.
          Follow-up questions may appear, up to two per main question.
        </p>
        <ol className="viva-steps">
          <li>Allow microphone access when the browser asks.</li>
          <li>Listen to the question, then start recording.</li>
          <li>Stop to submit. The next question is generated from your answer.</li>
        </ol>
        <Feedback type="info" message="This session uses the browser microphone. Speech-to-text is used when the browser supports it; otherwise a simulated transcript is stored." />
        <Button onClick={startSession}>Start examination</Button>
      </div>
    );
  }

  if (sessionState === 'starting') {
    return (
      <div className="viva-shell">
        <LoadingSpinner text="Preparing your examination session..." size={36} />
      </div>
    );
  }

  if (sessionState === 'mic-denied') {
    return (
      <div className="viva-shell">
        <Feedback type="error" title="Microphone blocked" message="Allow microphone access in the browser, then start the examination again." />
        <Button variant="secondary" onClick={() => setSessionState('ready')}>Back</Button>
      </div>
    );
  }

  if (sessionState === 'unsupported') {
    return (
      <div className="viva-shell">
        <Feedback type="error" title="Device not supported" message="This browser does not expose a microphone API. Use an up-to-date Chrome, Edge, or Firefox build." />
        <Button variant="secondary" onClick={() => window.history.back()}>Return to dashboard</Button>
      </div>
    );
  }

  if (sessionState === 'completed') {
    return (
      <div className="viva-shell">
        <Badge type="success">Submitted</Badge>
        <h1>Examination completed</h1>
        <p className="viva-lead">
          Your answers have been recorded and sent to your lecturer for final review.
        </p>
        <Button variant="secondary" onClick={() => window.history.back()}>
          Return to dashboard
        </Button>
      </div>
    );
  }

  const urgent = sessionState === 'recording' && remaining <= 20;
  const recording = sessionState === 'recording';
  const busy = sessionState === 'speaking' || sessionState === 'thinking';

  return (
    <div className="viva-shell">
      {sessionState === 'error' && (
        <Feedback
          type="error"
          title="Connection problem"
          message={errorMessage || 'The session could not continue. Check your network and retry.'}
        />
      )}

      <header className="viva-top">
        <div>
          <p className="page-kicker">{session?.examName || 'Java Programming Viva'}</p>
          <h1>
            Question {question?.mainIndex || 1} of {question?.mainTotal || session?.mainTotal || 3}
            {question?.type === TURN_TYPE.FOLLOW_UP ? ' · Follow-up' : ''}
          </h1>
        </div>
        <p className={`viva-timer ${urgent ? 'is-urgent' : ''} ${recording ? 'is-recording' : ''}`}>
          <span>{recording ? 'Time left' : 'Answer limit'}</span>
          <strong>{formatTime(recording ? remaining : session?.answerLimitSeconds || 120)}</strong>
        </p>
      </header>

      <div className="viva-stage">
        <aside className={`examiner-panel is-${sessionState}`} aria-live="polite">
          <div className="examiner-avatar" aria-hidden="true">AI</div>
          <p className="examiner-label">Virtual examiner</p>
          <p className="viva-status">{AI_STATUS[sessionState] || 'Idle'}</p>
          {recording && (
            <div className="wave-bars" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
          )}
        </aside>

        <div>
          <p className="follow-up-meter">
            Follow-ups remaining: {question?.followUpsRemaining ?? session?.followUpsRemaining ?? 0} / {session?.maxFollowUpsPerQuestion ?? 2}
          </p>
          <section className="viva-question" aria-live="polite">
            <p className="question-kicker">
              {question?.type === TURN_TYPE.FOLLOW_UP ? 'Follow-up question' : 'Current question'}
              {canUseSpeechSynthesis() && sessionState === 'speaking' ? ' · playing aloud' : ''}
            </p>
            <h2 className="viva-question-title">{question?.content}</h2>
            {question?.reason && <p className="answer-note">Why this follow-up: {question.reason}</p>}
          </section>
        </div>
      </div>

      <section className="answer-panel" aria-label="Answer">
        <h2>Live transcript</h2>
        {sessionState === 'thinking' ? (
          <>
            <p className="answer-text">{answerText}</p>
            <p className="answer-note">Answer submitted. The examiner is preparing the next question.</p>
          </>
        ) : (
          <p className="answer-text">{answerText || (recording ? 'Listening…' : 'Nothing is being recorded yet.')}</p>
        )}
        {transcriptLog.length > 0 && (
          <ol className="viva-log">
            {transcriptLog.map((item, index) => (
              <li key={`${item.question}-${index}`}>
                <strong>{item.type === TURN_TYPE.FOLLOW_UP ? 'Follow-up' : 'Q'}:</strong> {item.answer}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className={`viva-controls ${busy ? 'viva-disabled' : ''}`}>
        {sessionState === 'error' ? (
          <Button onClick={retryConnection}>Retry</Button>
        ) : (
          <button
            type="button"
            onClick={recording ? stopAndSubmit : beginRecording}
            className={`record-button ${recording ? 'is-recording' : ''}`}
            aria-pressed={recording}
            disabled={sessionState === 'speaking'}
            aria-label={recording ? 'Stop recording and submit answer' : 'Start recording answer'}
          >
            {recording ? <Square size={20} /> : <Mic size={22} />}
            {recording ? 'Stop and submit' : 'Start recording'}
          </button>
        )}
        <Button variant="secondary" onClick={handleEnd}>End examination</Button>
      </div>
    </div>
  );
}
