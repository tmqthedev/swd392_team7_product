import React, { useState } from 'react';
import { Check, X, Edit2, Save, FileText, Activity } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input, Textarea } from '../../components/ui/Input';
import { Feedback } from '../../components/ui/Feedback';
import { Table, Thead, Tbody, Tr, Th, Td } from '../../components/ui/Table';

export default function LecturerEvaluationReview() {
  const [evaluationState, setEvaluationState] = useState('reviewing'); // reviewing, editing, approved
  
  // Mock data for the evaluation
  const [student] = useState({ name: 'Jane Doe', id: 'SE150123', exam: 'Java Programming Viva' });
  const [aiScore, setAiScore] = useState(8.5);
  const [aiFeedback, setAiFeedback] = useState('The student demonstrated a solid understanding of OOP concepts. However, the explanation of Encapsulation could be more detailed with real-world examples. Good grasp of polymorphism and inheritance.');
  
  const [adjustedScore, setAdjustedScore] = useState(aiScore);
  const [adjustedFeedback, setAdjustedFeedback] = useState(aiFeedback);

  const transcript = [
    { turn: 1, q: "Explain the principles of Object-Oriented Programming (OOP) in Java.", a: "OOP in Java is based on four main principles: Encapsulation, Inheritance, Polymorphism, and Abstraction. These principles allow us to create modular and reusable code.", audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { turn: 2, q: "You mentioned Encapsulation. Can you explain how it is implemented in Java and why it is useful?", a: "Encapsulation is implemented using private fields and public getter/setter methods. It protects the data from unauthorized access and modification.", audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" }
  ];

  const handleApprove = () => {
    setAdjustedScore(aiScore);
    setAdjustedFeedback(aiFeedback);
    setEvaluationState('approved');
  };

  const handleAdjustSave = () => {
    setEvaluationState('approved');
  };

  return (
    <div className="page-content animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Evaluation Review</h1>
          <p style={{ color: 'var(--text-muted)' }}>{student.exam} - {student.name} ({student.id})</p>
        </div>
        {evaluationState === 'approved' ? (
          <Badge type="success">Finalized</Badge>
        ) : (
          <Badge type="warning">Pending Review</Badge>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        
        {/* Left Column: Transcript */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} className="text-primary" />
                <h3 style={{ margin: 0 }}>Interview Transcript</h3>
              </div>
            </CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {transcript.map((item) => (
                <div key={item.turn} style={{ background: 'var(--surface-alt)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <Badge type="info">Turn {item.turn}</Badge>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-main)' }}>AI Question:</strong>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>{item.q}</p>
                  </div>
                  <div>
                    <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--primary)' }}>Student Answer:</strong>
                    <p style={{ margin: 0, marginBottom: '0.5rem' }}>{item.a}</p>
                    {item.audioUrl && (
                      <audio controls src={item.audioUrl} style={{ height: '36px', width: '100%', borderRadius: '4px', outline: 'none' }}>
                        Your browser does not support the audio element.
                      </audio>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        {/* Right Column: AI Evaluation & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {evaluationState === 'approved' && (
            <Feedback type="success" title="Evaluation Finalized" message={`Final Score: ${adjustedScore}/10`} />
          )}

          <Card className="glass-panel" style={{ borderTop: '4px solid var(--primary)' }}>
            <CardHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={20} className="text-primary" />
                <h3 style={{ margin: 0 }}>AI Suggested Evaluation</h3>
              </div>
            </CardHeader>
            
            {evaluationState === 'editing' ? (
              <CardBody>
                <Input 
                  label="Adjusted Score (0-10)" 
                  type="number" 
                  step="0.5" 
                  min="0" max="10"
                  value={adjustedScore} 
                  onChange={(e) => setAdjustedScore(e.target.value)} 
                />
                <Textarea 
                  label="Adjusted Feedback" 
                  value={adjustedFeedback} 
                  onChange={(e) => setAdjustedFeedback(e.target.value)} 
                />
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <Button variant="secondary" onClick={() => setEvaluationState('reviewing')} style={{ flex: 1 }}>Cancel</Button>
                  <Button onClick={handleAdjustSave} style={{ flex: 1 }} icon={<Save size={16} />}>Save Changes</Button>
                </div>
              </CardBody>
            ) : (
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: 'var(--primary)' }}>
                    {evaluationState === 'approved' ? adjustedScore : aiScore}
                  </span>
                  <span style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>/ 10</span>
                </div>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Feedback</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {evaluationState === 'approved' ? adjustedFeedback : aiFeedback}
                  </p>
                </div>

                {evaluationState === 'reviewing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Button onClick={handleApprove} icon={<Check size={18} />} style={{ width: '100%' }}>
                      Approve Evaluation
                    </Button>
                    <Button variant="secondary" onClick={() => setEvaluationState('editing')} icon={<Edit2 size={18} />} style={{ width: '100%' }}>
                      Adjust Score & Feedback
                    </Button>
                  </div>
                )}
                
                {evaluationState === 'approved' && (
                  <Button variant="secondary" onClick={() => setEvaluationState('editing')} icon={<Edit2 size={18} />} style={{ width: '100%', marginTop: '1rem' }}>
                    Edit Final Result
                  </Button>
                )}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
