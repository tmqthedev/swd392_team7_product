export function examSpeechLocale(language) {
  return String(language || 'VI').toUpperCase().startsWith('EN') ? 'en-US' : 'vi-VN';
}

export function resendAudioAnswer(socket, { interviewId, turnId, chunks, contentType, timedOut }, callback) {
  socket.emit('answer:start', { interviewId, turnId });
  for (const chunk of chunks) socket.emit('audio:chunk', { interviewId, turnId, chunk });
  socket.emit('answer:end', { interviewId, turnId, contentType, timedOut }, callback);
}

export function playBrowserQuestion(text, language, onDone, {
  speech = globalThis.window?.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  onUnavailable = () => {},
} = {}) {
  if (!speech || !Utterance || !text) return { supported: false, cancel() {} };
  let finished = false;
  const done = () => { if (!finished) { finished = true; onDone(); } };
  try {
    speech.cancel();
    const utterance = new Utterance(text);
    utterance.lang = examSpeechLocale(language);
    utterance.onend = done;
    utterance.onerror = () => { if (!finished) { finished = true; onUnavailable(); } };
    speech.speak(utterance);
    return { supported: true, cancel() { finished = true; speech.cancel(); } };
  } catch { return { supported: false, cancel() { finished = true; } }; }
}
