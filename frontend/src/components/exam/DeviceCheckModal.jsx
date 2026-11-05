import { t, useLocale } from '../../i18n/index';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Volume2, CheckCircle, AlertCircle, Play, RotateCw, Circle } from 'lucide-react';
import Modal from '../Modal';
import { Button } from '../ui/Button';
import {
  getPreferredMicId,
  setPreferredMicId,
  openMicStream,
  missingAudioSupport,
  micErrorCode,
  levelFromTimeDomain,
  VOICE_LEVEL_THRESHOLD,
  VOICE_REQUIRED_MS,
} from '../../shared/utils/audioDevices';

const SUPPORT_MESSAGES = {
  INSECURE_CONTEXT: 'The exam needs a secure (https) connection to use your microphone.',
  NO_GET_USER_MEDIA: 'This browser cannot access a microphone. Please use the latest Chrome, Edge or Firefox.',
  NO_MEDIA_RECORDER: 'This browser cannot record audio. Please use the latest Chrome, Edge or Firefox.',
  NO_AUDIO_CONTEXT: 'This browser cannot play test audio. Please use the latest Chrome, Edge or Firefox.',
};

const MIC_MESSAGES = {
  MIC_DENIED: 'Microphone access was blocked. Click the lock icon next to the address bar, allow the microphone, then press Try again.',
  MIC_NOT_FOUND: 'No microphone was found. Plug in a microphone or headset, then press Try again.',
  MIC_IN_USE: 'The microphone is being used by another app (Zoom, Teams, ...). Close that app, then press Try again.',
  MIC_UNKNOWN: 'Could not open the microphone. Press Try again or reload the page.',
};

function StepTitle({ index, done, icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
      {done
        ? <CheckCircle size={20} style={{ color: '#10b981', flexShrink: 0 }} />
        : <Circle size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      <span style={{ fontWeight: 600 }}>{index}. {title}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{icon}</span>
    </div>
  );
}

function DeviceCheckBody({ onCancel, onConfirm, confirming, resuming }) {
  const [supportError] = useState(() => missingAudioSupport());
  const [micStatus, setMicStatus] = useState('requesting'); // requesting | ready | error
  const [micError, setMicError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => getPreferredMicId() || '');
  const [level, setLevel] = useState(0);
  const [voiceMs, setVoiceMs] = useState(0);
  const [speakerStatus, setSpeakerStatus] = useState('idle'); // idle | playing | played
  const [speakerHeard, setSpeakerHeard] = useState(null); // null | true | false
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState(null);

  const streamRef = useRef(null);
  const micCtxRef = useRef(null);
  const rafRef = useRef(null);
  const toneCtxRef = useRef(null);
  const recorderRef = useRef(null);
  const clipUrlRef = useRef(null);
  const voiceMsRef = useRef(0);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (micCtxRef.current && micCtxRef.current.state !== 'closed') {
      micCtxRef.current.close().catch(() => {});
    }
    micCtxRef.current = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'audioinput' && d.deviceId));
    } catch { /* listing is optional */ }
  }, []);

  const startMic = useCallback(async (wantedId) => {
    stopMic();
    setMicStatus('requesting');
    setMicError(null);
    setLevel(0);
    voiceMsRef.current = 0;
    setVoiceMs(0);
    try {
      const stream = await openMicStream(wantedId || null);
      streamRef.current = stream;
      const actualId = stream.getAudioTracks()[0]?.getSettings?.().deviceId || wantedId || '';
      setDeviceId(actualId);
      setPreferredMicId(actualId || null);
      await refreshDevices();

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      micCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let last = performance.now();
      const tick = (now) => {
        if (micCtxRef.current !== ctx) return;
        analyser.getByteTimeDomainData(samples);
        const value = levelFromTimeDomain(samples);
        const elapsed = Math.min(100, now - last);
        last = now;
        if (value >= VOICE_LEVEL_THRESHOLD && voiceMsRef.current < VOICE_REQUIRED_MS) {
          voiceMsRef.current = Math.min(VOICE_REQUIRED_MS, voiceMsRef.current + elapsed);
          setVoiceMs(voiceMsRef.current);
        }
        setLevel(value);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setMicStatus('ready');
    } catch (err) {
      stopMic();
      setMicStatus('error');
      setMicError(micErrorCode(err));
    }
  }, [refreshDevices, stopMic]);

  useEffect(() => {
    if (supportError) return undefined;
    // Ask for the microphone as soon as the dialog opens.
    const id = setTimeout(() => startMic(getPreferredMicId()), 0);
    const md = navigator.mediaDevices;
    md.addEventListener?.('devicechange', refreshDevices);
    return () => {
      clearTimeout(id);
      md.removeEventListener?.('devicechange', refreshDevices);
      stopMic();
      if (toneCtxRef.current && toneCtxRef.current.state !== 'closed') toneCtxRef.current.close().catch(() => {});
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, [supportError, startMic, stopMic, refreshDevices]);

  const playTestTone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!toneCtxRef.current || toneCtxRef.current.state === 'closed') toneCtxRef.current = new AudioCtx();
      const ctx = toneCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const start = ctx.currentTime + 0.05;
      const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
      let lastOsc = null;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = start + i * 0.35;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.35, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.32);
        lastOsc = osc;
      });
      setSpeakerStatus('playing');
      setSpeakerHeard(null);
      lastOsc.onended = () => setSpeakerStatus('played');
    } catch {
      setSpeakerStatus('played');
    }
  };

  const recordClip = () => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      setRecording(false);
      if (!chunks.length) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = url;
      setClipUrl(url);
      new Audio(url).play().catch(() => {});
    };
    setRecording(true);
    recorder.start();
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 3000);
  };

  const micOk = micStatus === 'ready' && voiceMs >= VOICE_REQUIRED_MS;
  const speakerOk = speakerHeard === true;
  const canContinue = !supportError && micOk && speakerOk && !recording && !confirming;

  const handleConfirm = () => {
    stopMic();
    onConfirm();
  };

  if (supportError) {
    return (
      <>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '0.75rem', color: '#b91c1c' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <p>{t(SUPPORT_MESSAGES[supportError])}</p>
          </div>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onCancel}>{t("Cancel")}</Button>
        </div>
      </>
    );
  }

  const sectionStyle = { background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: 'var(--radius-md, 8px)', padding: '1rem', marginBottom: '1rem' };

  return (
    <>
      <div className="modal-body">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          {resuming
            ? t("Your exam timer is already running. Check your audio quickly, then continue.")
            : t("Check your microphone and speakers before you start. The exam timer starts only after you press Start.")}
        </p>

        {/* Step 1: microphone */}
        <div style={sectionStyle}>
          <StepTitle index={1} done={micOk} icon={<Mic size={18} />} title={t("Microphone")} />

          {micStatus === 'error' ? (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', color: '#b91c1c', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{t(MIC_MESSAGES[micError] || MIC_MESSAGES.MIC_UNKNOWN)}</span>
              </div>
              <Button variant="secondary" onClick={() => startMic(deviceId)}>
                <RotateCw size={16} />{t("Try again")}
              </Button>
            </div>
          ) : (
            <>
              {devices.length > 1 && (
                <select
                  className="form-select"
                  aria-label={t("Choose microphone")}
                  value={deviceId}
                  onChange={(e) => startMic(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || t("Microphone {v0}", { v0: i + 1 })}</option>
                  ))}
                </select>
              )}
              <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: micOk ? '#059669' : 'var(--text-muted)' }}>
                {micStatus === 'requesting'
                  ? t("Waiting for microphone permission...")
                  : micOk
                    ? t("We can hear you.")
                    : t("Say a few words out loud, for example: \"Hello, I am ready\".")}
              </div>
              <div
                role="meter"
                aria-label={t("Microphone Signal Strength")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={level}
                style={{ width: '100%', height: '12px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', overflow: 'hidden' }}
              >
                <div style={{ width: `${level}%`, height: '100%', background: level > 85 ? '#ef4444' : level >= VOICE_LEVEL_THRESHOLD ? '#10b981' : '#6366f1', transition: 'width 0.08s linear' }} />
              </div>
              {micStatus === 'ready' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <Button variant="secondary" onClick={recordClip} disabled={recording}>
                    <Mic size={16} />{recording ? t("Recording 3 s...") : t("Record 3 s and play back")}
                  </Button>
                  {clipUrl && <audio controls src={clipUrl} style={{ height: '32px', maxWidth: '100%' }} />}
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 2: speakers */}
        <div style={sectionStyle}>
          <StepTitle index={2} done={speakerOk} icon={<Volume2 size={18} />} title={t("Speakers or headphones")} />
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            {t("Questions are read aloud. Play the test sound and make sure you hear it clearly.")}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={playTestTone} disabled={speakerStatus === 'playing'}>
              <Play size={16} />{speakerStatus === 'idle' ? t("Play test sound") : t("Play again")}
            </Button>
            {speakerStatus === 'played' && (
              <>
                <Button variant={speakerHeard === true ? 'primary' : 'secondary'} onClick={() => setSpeakerHeard(true)}>
                  <CheckCircle size={16} />{t("I heard it")}
                </Button>
                <Button variant="secondary" onClick={() => setSpeakerHeard(false)}>{t("I heard nothing")}</Button>
              </>
            )}
          </div>
          {speakerHeard === false && (
            <p style={{ fontSize: '0.85rem', color: '#b45309', marginTop: '0.75rem' }}>
              {t("Turn up the volume, check that the right output device is selected in your system, unplug and replug your headphones, then play the sound again.")}
            </p>
          )}
        </div>
      </div>

      <div className="modal-footer">
        <Button variant="secondary" onClick={onCancel}>{t("Cancel")}</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!canContinue} isLoading={confirming}>
          <CheckCircle size={16} />{resuming ? t("Continue the exam") : t("Start the exam")}
        </Button>
      </div>
    </>
  );
}

// Pre-exam audio check: microphone permission and level, then a speaker test.
// The parent starts or resumes the interview only from onConfirm.
export default function DeviceCheckModal({ isOpen, onClose, onConfirm, confirming = false, resuming = false, examTitle }) {
  useLocale();
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!confirming) onClose(); }}
      title={examTitle ? t("Audio check: {v0}", { v0: examTitle }) : t("Microphone & Audio Equipment Check")}
    >
      <DeviceCheckBody onCancel={onClose} onConfirm={onConfirm} confirming={confirming} resuming={resuming} />
    </Modal>
  );
}
