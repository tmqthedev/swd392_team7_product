import { apiRequest } from './authApi';

export function listMyExamSessions() {
  return apiRequest('/me/exam-sessions');
}

export function startOrResumeInterview(examSessionId) {
  return apiRequest('/interviews', {
    method: 'POST',
    body: { examSessionId },
  });
}

export function getInterviewState(interviewId) {
  return apiRequest(`/interviews/${interviewId}`);
}

export function markQuestionPlayed(interviewId, turnId) {
  return apiRequest(`/interviews/${interviewId}/turns/${turnId}/played`, {
    method: 'POST',
  });
}

export function submitAnswer(interviewId, turnId, { transcript, timedOut, signals, audioBlob }) {
  if (audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'answer.webm');
    if (timedOut) formData.append('timedOut', 'true');
    if (transcript) formData.append('transcript', JSON.stringify(transcript));
    if (signals) formData.append('signals', JSON.stringify(signals));
    return apiRequest(`/interviews/${interviewId}/turns/${turnId}/answer`, {
      method: 'POST',
      raw: formData,
    });
  }
  return apiRequest(`/interviews/${interviewId}/turns/${turnId}/answer`, {
    method: 'POST',
    body: { transcript, timedOut, signals },
  });
}
