import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Mic,
  Volume2,
  Square,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCw,
  Home,
  Headphones,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/Loading';
import { Feedback } from '../../components/ui/Feedback';
import { createInterviewSocket } from '../../services/interviewSocket';

export default function StudentVivaSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const interviewIdParam = searchParams.get('interviewId');

  // Phases: 'INITIALIZING', 'MIC_CHECK', 'QUESTION_PLAYING', 'THINKING', 'ANSWERING', 'PROCESSING', 'COMPLETED', 'ERROR'
  const [phase, setPhase] = useState(() => (interviewIdParam ? 'INITIALIZING' : 'ERROR'));
  const [sessionState, setSessionState] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [errorMessage, setErrorMessage] = useState(() => (!interviewIdParam ? 'Missing interviewId parameter.' : null));

  // Timers
  const [thinkCountdown, setThinkCountdown] = useState(0);
  const [answerCountdown, setAnswerCountdown] = useState(0);
  const [sessionRemainingSec, setSessionRemainingSec] = useState(null);

  // Mic check audio level
  const [micVolume, setMicVolume] = useState(0);
  const [micGranted, setMicGranted] = useState(false);
  // Mic check playback: a short clip the student records and hears back.
  const [testClipUrl, setTestClipUrl] = useState(null);
  const [recordingTest, setRecordingTest] = useState(false);

  // Refs
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioElementRef = useRef(null);
  const thinkIntervalRef = useRef(null);
  const answerIntervalRef = useRef(null);
  const sessionIntervalRef = useRef(null);
  const playQuestionAudioRef = useRef(null);

  // Clean up media resources
  const cleanupMedia = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    clearInterval(thinkIntervalRef.current);
    clearInterval(answerIntervalRef.current);
    clearInterval(sessionIntervalRef.current);
  }, []);

  useEffect(() => {
    return () => {
      cleanupMedia();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [cleanupMedia]);

  // Connect socket and join interview
  useEffect(() => {
    if (!interviewIdParam) return;

    const socket = createInterviewSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('interview:join', { interviewId: Number(interviewIdParam) }, (res) => {
        if (!res || !res.ok) {
          setErrorMessage(res?.error || 'Failed to join interview room.');
          setPhase('ERROR');
          return;
        }
        setSessionState(res.state);

        if (res.state.status === 'COMPLETED' || res.state.endedAt) {
          setPhase('COMPLETED');
        } else if (res.state.currentTurn?.status === 'ANSWERING') {
          // A8: Reconnection during active answering
          const q = {
            turnId: res.state.currentTurn.turnId,
            questionText: res.state.currentTurn.questionText,
            questionAudioUrl: res.state.currentTurn.audioKey ? `/api/tts/${res.state.currentTurn.audioKey.split('/').pop()}` : null,
            thinkTimeSec: res.state.thinkTimeSec ?? 0,
            answerTimeSec: res.state.answerTimeLimitSec ?? 120,
            questionNo: res.state.questionNumber ?? 1,
            followUpNo: res.state.followUpNumber ?? 0,
            totalQuestions: res.state.totalQuestions ?? 0,
            maxFollowUps: res.state.maxFollowUps ?? 0,
            turnType: res.state.currentTurn.turnType,
          };
          setCurrentQuestion(q);
          const remSec = Math.max(1, Math.floor((res.state.currentTurn.remainingAnswerMs || 1000) / 1000));
          setAnswerCountdown(remSec);
          setPhase('ANSWERING');
        } else if (res.state.currentTurn?.status === 'ASKED') {
          // The first question is created ASKED when the interview starts, so a
          // fresh interview lands here: run the mic check before playing it.
          // Resuming a later question skips the check.
          const isFirstQuestion = !res.state.currentTurn.playedAt
            && (res.state.questionNumber ?? 1) === 1
            && (res.state.followUpNumber ?? 0) === 0;
          const q = {
            turnId: res.state.currentTurn.turnId,
            questionText: res.state.currentTurn.questionText,
            questionAudioUrl: res.state.currentTurn.audioKey ? `/api/tts/${res.state.currentTurn.audioKey.split('/').pop()}` : null,
            thinkTimeSec: res.state.thinkTimeSec ?? 0,
            answerTimeSec: res.state.answerTimeLimitSec ?? 120,
            questionNo: res.state.questionNumber ?? 1,
            followUpNo: res.state.followUpNumber ?? 0,
            totalQuestions: res.state.totalQuestions ?? 0,
            maxFollowUps: res.state.maxFollowUps ?? 0,
            turnType: res.state.currentTurn.turnType,
          };
          setCurrentQuestion(q);
          if (isFirstQuestion) {
            setPhase('MIC_CHECK');
          } else {
            playQuestionAudioRef.current?.(q);
          }
        } else {
          setPhase('MIC_CHECK');
        }
      });
    });

    socket.on('connect_error', (err) => {
      setErrorMessage(err.message || 'Connection to interview server failed.');
      setPhase('ERROR');
    });

    socket.on('interview:state', (state) => {
      setSessionState(state);
    });

    socket.on('question:new', (q) => {
      setCurrentQuestion(q);
      playQuestionAudioRef.current?.(q);
    });

    socket.on('turn:retry', (data) => {
      setPhase('ANSWERING');
      setErrorMessage(data?.message || 'Audio rỗng hoặc lỗi nhận diện. Bạn được nói lại 1 lần.');
      if (data?.remainingAnswerMs) {
        setAnswerCountdown(Math.max(1, Math.floor(data.remainingAnswerMs / 1000)));
      }
    });

    socket.on('turn:processing', () => {
      setPhase('PROCESSING');
    });

    socket.on('interview:completed', () => {
      cleanupMedia();
      setPhase('COMPLETED');
    });

    socket.on('turn:error', (err) => {
      setErrorMessage(err.message || 'Turn processing error.');
    });

    socket.connect();
  }, [interviewIdParam, cleanupMedia]);

  // Session countdown timer
  useEffect(() => {
    if (!sessionState || !sessionState.deadlineAt) return;

    const tick = () => {
      const remainingMs = Math.max(0, new Date(sessionState.deadlineAt).getTime() - Date.now());
      setSessionRemainingSec(Math.floor(remainingMs / 1000));
    };

    tick();
    sessionIntervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(sessionIntervalRef.current);
  }, [sessionState]);

  // Handle microphone testing
  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setMicGranted(true);

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!audioContextRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {
      setMicGranted(false);
      setErrorMessage('Microphone access denied. Please allow microphone permissions in your browser.');
    }
  };

  // Record a 3-second clip and play it back so the student hears their own mic.
  const recordTestClip = () => {
    const stream = mediaStreamRef.current;
    if (!stream || recordingTest) return;
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      setRecordingTest(false);
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      setTestClipUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      new Audio(url).play().catch(() => {});
    };
    setRecordingTest(true);
    recorder.start();
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 3000);
  };

  // Confirm mic ready and start exam
  const handleReady = () => {
    if (!socketRef.current) return;
    setPhase('PROCESSING');
    socketRef.current.emit('interview:ready', { interviewId: Number(interviewIdParam) });
  };

  // Submit answer
  const submitRecordedAnswer = (timedOut = false) => {
    clearInterval(answerIntervalRef.current);
    setPhase('PROCESSING');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch { /* ignore */ }
    }

    if (socketRef.current && currentQuestion) {
      socketRef.current.emit('answer:end', {
        interviewId: Number(interviewIdParam),
        turnId: currentQuestion.turnId,
        contentType: 'audio/webm',
        timedOut: !!timedOut,
      }, (res) => {
        if (!res || !res.ok) {
          setErrorMessage(res?.error || 'Failed to submit answer.');
        }
      });
    }
  };

  // Start recording answer
  const startAnswerRecording = async (q) => {
    clearInterval(thinkIntervalRef.current);
    setPhase('ANSWERING');

    const answerSec = q.answerTimeSec || 120;
    setAnswerCountdown(answerSec);

    if (socketRef.current) {
      socketRef.current.emit('answer:start', {
        interviewId: Number(interviewIdParam),
        turnId: q.turnId,
      });
    }

    try {
      let stream = mediaStreamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0 && socketRef.current) {
          socketRef.current.emit('audio:chunk', {
            interviewId: Number(interviewIdParam),
            turnId: q.turnId,
            chunk: e.data,
          });
        }
      };

      // Slice audio chunks every 1000ms
      recorder.start(1000);
    } catch (err) {
      setErrorMessage('Could not initialize audio recorder: ' + err.message);
    }

    // Answer countdown timer
    clearInterval(answerIntervalRef.current);
    answerIntervalRef.current = setInterval(() => {
      setAnswerCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(answerIntervalRef.current);
          submitRecordedAnswer(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Skip thinking countdown and answer immediately
  const handleSkipThinking = () => {
    clearInterval(thinkIntervalRef.current);
    if (currentQuestion) {
      startAnswerRecording(currentQuestion);
    }
  };

  // Transition from question playing to thinking window
  const handleQuestionPlayed = (q) => {
    if (!socketRef.current) return;

    socketRef.current.emit('question:played', {
      interviewId: Number(interviewIdParam),
      turnId: q.turnId,
    }, (res) => {
      if (res && res.view) {
        setSessionState(res.view);
      }
    });

    const thinkSec = q.thinkTimeSec ?? 0;
    if (thinkSec > 0) {
      setPhase('THINKING');
      setThinkCountdown(thinkSec);

      clearInterval(thinkIntervalRef.current);
      thinkIntervalRef.current = setInterval(() => {
        setThinkCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(thinkIntervalRef.current);
            startAnswerRecording(q);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      startAnswerRecording(q);
    }
  };

  const fallbackSpeech = (q) => {
    if ('speechSynthesis' in window && q.questionText) {
      const utterance = new SpeechSynthesisUtterance(q.questionText);
      utterance.onend = () => handleQuestionPlayed(q);
      utterance.onerror = () => handleQuestionPlayed(q);
      window.speechSynthesis.speak(utterance);
    } else {
      // Auto move after 4 seconds reading allowance
      setTimeout(() => handleQuestionPlayed(q), 4000);
    }
  };

  // Play question audio
  const playQuestionAudio = (q) => {
    setPhase('QUESTION_PLAYING');

    if (q.questionAudioUrl) {
      const audio = new Audio(q.questionAudioUrl);
      audioElementRef.current = audio;

      audio.onended = () => {
        handleQuestionPlayed(q);
      };

      audio.onerror = () => {
        // Fallback to text synthesis or immediate think window
        fallbackSpeech(q);
      };

      audio.play().catch(() => {
        fallbackSpeech(q);
      });
    } else {
      fallbackSpeech(q);
    }
  };
  useEffect(() => {
    playQuestionAudioRef.current = playQuestionAudio;
  });

  const formatTimer = (secs) => {
    if (secs == null || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-lg, 12px)', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--primary, #4f46e5)' }}>
            AI Viva Room
          </span>
          {sessionState && (
            <Badge variant="neutral">
              Question {(sessionState.currentQuestionIndex || 0) + 1}/{sessionState.totalQuestions || 3}
              {sessionState.currentFollowUpCount > 0 && ` • Follow-up ${sessionState.currentFollowUpCount}`}
            </Badge>
          )}
        </div>

        {sessionRemainingSec != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', color: sessionRemainingSec < 300 ? '#ef4444' : 'var(--text)' }}>
            <Clock size={16} />
            <span>Session Remaining: {formatTimer(sessionRemainingSec)}</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Feedback type="error" message={errorMessage} onClose={() => setErrorMessage(null)} />
        </div>
      )}

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {phase === 'INITIALIZING' && (
          <motion.div key="init" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <CardBody style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                <LoadingSpinner size={42} text="Connecting to viva interview session..." />
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'MIC_CHECK' && (
          <motion.div key="mic" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHeader style={{ textAlign: 'center', paddingBottom: 0 }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                  <Headphones size={32} />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                  Microphone & Audio Equipment Check
                </h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto' }}>
                  Please test your microphone before entering the examination. Speak a few words to verify audio input volume.
                </p>
              </CardHeader>

              <CardBody style={{ padding: '2rem' }}>
                <div style={{ background: 'var(--bg-subtle, rgba(0,0,0,0.02))', padding: '1.5rem', borderRadius: 'var(--radius-md, 8px)', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Microphone Signal Strength</span>
                    <span style={{ fontSize: '0.875rem', color: micVolume > 20 ? '#10b981' : 'var(--text-muted)' }}>
                      {micGranted ? (micVolume > 20 ? 'Active & Clear' : 'Listening...') : 'Not started'}
                    </span>
                  </div>

                  {/* Volume Visualizer */}
                  <div style={{ width: '100%', height: '14px', background: 'rgba(0,0,0,0.1)', borderRadius: '7px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${micVolume}%`,
                        height: '100%',
                        background: micVolume > 70 ? '#ef4444' : micVolume > 25 ? '#10b981' : '#6366f1',
                        transition: 'width 0.1s ease',
                      }}
                    />
                  </div>
                </div>

                {micGranted && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <Button variant="outline" onClick={recordTestClip} disabled={recordingTest}>
                      <Volume2 size={18} />
                      {recordingTest ? 'Recording 3 s...' : 'Record 3 s and play back'}
                    </Button>
                    {testClipUrl && (
                      <audio controls src={testClipUrl} style={{ height: '36px' }} />
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  {!micGranted ? (
                    <Button variant="outline" onClick={startMicTest}>
                      <Mic size={18} />
                      Test Microphone
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={handleReady} disabled={recordingTest}>
                      <CheckCircle size={18} />
                      I am Ready • Begin Examination
                    </Button>
                  )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', textAlign: 'center', marginTop: '1rem' }}>
                  Your session timer started when you opened the exam. The first question plays as soon as you begin.
                </p>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'QUESTION_PLAYING' && (
          <motion.div key="playing" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card style={{ borderLeft: '4px solid #6366f1' }}>
              <CardBody style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                  <Volume2 size={36} className="animate-pulse" />
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  {currentQuestion?.turnType === 'FOLLOW_UP' ? 'AI Follow-up Question' : 'Main Question'}
                </div>

                <h3 style={{ fontSize: '1.4rem', fontWeight: '600', lineHeight: 1.5, maxWidth: '650px', margin: '0 auto 2rem auto' }}>
                  "{currentQuestion?.questionText}"
                </h3>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  AI interviewer is speaking... Listen carefully to the question.
                </p>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'THINKING' && (
          <motion.div key="thinking" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card style={{ borderLeft: '4px solid #f59e0b' }}>
              <CardBody style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                  <Sparkles size={36} />
                </div>

                <h3 style={{ fontSize: '1.4rem', fontWeight: '600', lineHeight: 1.5, maxWidth: '650px', margin: '0 auto 1.5rem auto' }}>
                  "{currentQuestion?.questionText}"
                </h3>

                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#d97706', marginBottom: '1rem' }}>
                  {thinkCountdown}s
                </div>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                  Preparation time. Your microphone will automatically activate when countdown expires.
                </p>

                <Button variant="primary" onClick={handleSkipThinking}>
                  <Mic size={18} />
                  Answer Immediately
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'ANSWERING' && (
          <motion.div key="answering" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card style={{ borderLeft: '4px solid #ef4444' }}>
              <CardBody style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                  <span style={{ color: '#ef4444', fontWeight: '700', letterSpacing: '0.05em' }}>
                    RECORDING LIVE ANSWER
                  </span>
                </div>

                <h3 style={{ fontSize: '1.4rem', fontWeight: '600', lineHeight: 1.5, maxWidth: '650px', margin: '0 auto 1.5rem auto' }}>
                  "{currentQuestion?.questionText}"
                </h3>

                <div style={{ fontSize: '2.5rem', fontWeight: '800', color: answerCountdown < 30 ? '#ef4444' : 'var(--text)', marginBottom: '1.5rem' }}>
                  {formatTimer(answerCountdown)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <Button variant="danger" onClick={() => submitRecordedAnswer(false)}>
                    <Square size={18} />
                    Submit Answer
                  </Button>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'PROCESSING' && (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <CardBody style={{ padding: '5rem 2rem', textAlign: 'center' }}>
                <LoadingSpinner size={42} text="AI is evaluating your response..." />
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.9rem' }}>
                  Please do not reload or close your browser window.
                </p>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'COMPLETED' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card style={{ borderLeft: '4px solid #10b981' }}>
              <CardBody style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                  <CheckCircle size={44} />
                </div>

                <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.75rem' }}>
                  Examination Completed!
                </h2>

                <p style={{ color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto 2rem auto', fontSize: '1.05rem', lineHeight: 1.6 }}>
                  Your oral responses and transcripts have been successfully recorded. The AI evaluation suggestions have been queued for lecturer review and grading.
                </p>

                <Button variant="primary" onClick={() => navigate('/student')}>
                  <Home size={18} />
                  Return to Dashboard
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {phase === 'ERROR' && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card style={{ borderLeft: '4px solid #ef4444' }}>
              <CardBody style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                  <AlertCircle size={36} />
                </div>

                <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                  Examination Encountered an Error
                </h3>

                <p style={{ color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto 2rem auto' }}>
                  {errorMessage || 'An unexpected error occurred while communicating with the interview server.'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <Button variant="primary" onClick={() => window.location.reload()}>
                    <RotateCw size={18} />
                    Retry / Reconnect
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/student')}>
                    <Home size={18} />
                    Dashboard
                  </Button>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
