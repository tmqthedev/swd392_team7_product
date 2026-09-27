import React, { useState, useEffect } from 'react';
import { Mic, Square, Volume2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Feedback } from '../../components/ui/Feedback';
import { LoadingSpinner } from '../../components/ui/Loading';

export default function StudentVivaSession() {
  const [sessionState, setSessionState] = useState('ready'); // ready, starting, active, answering, evaluating, completed, error
  const [isRecording, setIsRecording] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [totalTurns, setTotalTurns] = useState(5);
  const [questionText, setQuestionText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [timer, setTimer] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startSession = () => {
    setSessionState('starting');
    // Simulate API call to start session
    setTimeout(() => {
      setQuestionText('Explain the principles of Object-Oriented Programming (OOP) in Java.');
      setSessionState('active');
    }, 1500);
  };

  const handleRecordToggle = () => {
    if (!isRecording) {
      setIsRecording(true);
      setSessionState('answering');
    } else {
      setIsRecording(false);
      submitAnswer();
    }
  };

  const submitAnswer = () => {
    setSessionState('evaluating');
    setAnswerText('Simulated recorded answer text...');
    
    // Simulate AI evaluating and generating follow up
    setTimeout(() => {
      if (currentTurn < totalTurns) {
        setCurrentTurn(prev => prev + 1);
        setQuestionText('You mentioned Encapsulation. Can you explain how it is implemented in Java and why it is useful?');
        setAnswerText('');
        setSessionState('active');
      } else {
        setSessionState('completed');
      }
    }, 2500);
  };

  if (sessionState === 'ready') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Card style={{ maxWidth: '500px', textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Java Programming Viva</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            This examination will consist of {totalTurns} questions. You will be asked a question, and you must record your spoken answer. The AI will generate follow-up questions based on your responses.
          </p>
          <Feedback type="info" message="Ensure your microphone is connected and working before starting." />
          <Button onClick={startSession} style={{ width: '100%', marginTop: '1rem' }} icon={<ArrowRight size={18} />}>
            Start Examination
          </Button>
        </Card>
      </div>
    );
  }

  if (sessionState === 'starting') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner text="Connecting to AI Examiner and preparing your session..." size={48} />
      </div>
    );
  }

  if (sessionState === 'completed') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Card style={{ maxWidth: '600px', textAlign: 'center', padding: '3rem 2rem' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
            <CheckCircle size={64} style={{ color: 'var(--secondary)', margin: '0 auto 1.5rem auto' }} />
          </motion.div>
          <h2 style={{ marginBottom: '1rem' }}>Examination Completed</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            You have successfully completed all {totalTurns} turns of your viva session. Your answers have been recorded and sent to your lecturer for final review.
          </p>
          <Button variant="secondary" onClick={() => window.history.back()}>
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '800px', margin: '0 auto', paddingTop: '1rem' }}>
      
      {sessionState === 'error' && (
        <Feedback type="error" title="Connection Error" message={errorMessage} className="w-full mb-4" />
      )}

      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
        <Badge type="info" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>Turn {currentTurn} / {totalTurns}</Badge>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--secondary)', fontWeight: 500 }}>
          <Volume2 size={20} />
          <span>AI Audio Connected</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {sessionState === 'evaluating' ? (
          <motion.div
            key="evaluating"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{ width: '100%', marginBottom: '2rem' }}
          >
            <Card className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <LoadingSpinner text="AI is evaluating your answer and generating the next question..." size={40} />
            </Card>
          </motion.div>
        ) : (
          <motion.div 
            key="question"
            className="card glass-panel"
            style={{ width: '100%', marginBottom: '3rem', position: 'relative', overflow: 'hidden' }}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--primary)' }}></div>
            <h3 style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {currentTurn > 1 ? 'Follow-up Question' : 'Current Question'}
            </h3>
            <p style={{ fontSize: '1.25rem', lineHeight: 1.6, fontWeight: 500 }}>{questionText}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', opacity: sessionState === 'evaluating' ? 0.5 : 1, pointerEvents: sessionState === 'evaluating' ? 'none' : 'auto' }}>
        <motion.button 
          onClick={handleRecordToggle}
          className="btn"
          style={{ 
            width: '80px', height: '80px', borderRadius: '50%', 
            background: isRecording ? 'var(--accent)' : 'var(--primary)',
            color: 'white',
            boxShadow: isRecording ? '0 0 20px rgba(244, 63, 94, 0.6)' : '0 4px 12px rgba(79, 70, 229, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          animate={isRecording ? { boxShadow: ['0 0 0px rgba(244,63,94,0.4)', '0 0 30px rgba(244,63,94,0.8)', '0 0 0px rgba(244,63,94,0.4)'] } : {}}
          transition={{ duration: 1.5, repeat: isRecording ? Infinity : 0 }}
        >
          {isRecording ? <Square size={32} /> : <Mic size={32} />}
        </motion.button>
        
        <div style={{ fontSize: '1.5rem', fontWeight: 600, fontFamily: 'monospace', color: isRecording ? 'var(--accent)' : 'var(--text-muted)' }}>
          {formatTime(timer)}
        </div>
        
        <p style={{ color: 'var(--text-muted)' }}>
          {isRecording ? 'Recording your answer... Click to stop and submit.' : 'Click the microphone to start recording your answer.'}
        </p>
      </div>
    </div>
  );
}
