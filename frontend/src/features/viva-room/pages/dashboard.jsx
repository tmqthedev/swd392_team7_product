import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../shared/components/Button';
import { Badge } from '../../../shared/components/Badge';
import { getVivaBrief } from '../services/vivaService';
import './dashboard.scss';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [brief, setBrief] = useState({
    mainQuestionLimit: 3,
    maxFollowUpsPerQuestion: 2,
    answerLimitSeconds: 120,
  });

  useEffect(() => {
    getVivaBrief().then(setBrief).catch(() => {});
  }, []);

  return (
    <div className="student-dashboard">
      <header className="page-header">
        <div>
          <p className="page-kicker">Student</p>
          <h1>Examinations</h1>
          <p>
            {user?.name ? `${user.name}, your` : 'Your'} next viva is ready. Completed sittings and released results are listed below.
          </p>
        </div>
      </header>

      <section className="upcoming-exam" aria-labelledby="upcoming-heading">
        <div className="upcoming-main">
          <div className="upcoming-intro">
            <div className="examiner-chip" aria-hidden="true">AI</div>
            <Badge type="info">Upcoming viva</Badge>
          </div>
          <h2 id="upcoming-heading">Java Programming Viva</h2>
          <p>Oral examination with a virtual examiner. Later questions follow from your spoken answers.</p>
          <Button onClick={() => navigate('/student/viva')}>
            Start examination
          </Button>
        </div>
        <dl className="exam-facts">
          <div>
            <dt>Status</dt>
            <dd>Ready to start</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>About 15–20 minutes</dd>
          </div>
          <div>
            <dt>Main questions</dt>
            <dd>{brief.mainQuestionLimit}</dd>
          </div>
          <div>
            <dt>Each answer</dt>
            <dd>Up to {Math.round(brief.answerLimitSeconds / 60)} minutes</dd>
          </div>
        </dl>
      </section>

      <section className="prep-section" aria-labelledby="prep-heading">
        <h2 id="prep-heading">Before you begin</h2>
        <ol>
          <li>Speak clearly and directly into the microphone.</li>
          <li>You will have {Math.round(brief.answerLimitSeconds / 60)} minutes to answer each question.</li>
          <li>Follow-up questions are based on your answers (max {brief.maxFollowUpsPerQuestion} per main question).</li>
        </ol>
      </section>

      <div className="student-records">
        <section aria-labelledby="completed-heading">
          <h2 id="completed-heading">Completed exams</h2>
          <p>No completed viva sessions yet.</p>
        </section>
        <section aria-labelledby="results-heading">
          <h2 id="results-heading">Recent results</h2>
          <p>Results appear here after your lecturer finalizes a review.</p>
        </section>
      </div>
    </div>
  );
}
