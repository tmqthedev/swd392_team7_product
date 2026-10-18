export function canUseSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function canUseSpeechRecognition() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function speakText(text, { lang = 'en-US' } = {}) {
  if (!canUseSpeechSynthesis() || !text) return Promise.resolve();

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.95;

  return new Promise((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (canUseSpeechSynthesis()) window.speechSynthesis.cancel();
}

export function createRecognizer({ lang = 'en-US', onResult } = {}) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognizer = new Ctor();
  recognizer.lang = lang;
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.onresult = (event) => {
    let transcript = '';
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += `${event.results[index][0].transcript} `;
    }
    onResult?.(transcript.trim());
  };
  return recognizer;
}
