import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { api } from './api';
import { toast } from './store';
import { Spinner } from './components';
import { fmtDuration, toWaveform } from './utils';

/* ==========================================================================
   Voice messages: recording with a live level meter, and playback with a waveform.
   ========================================================================== */

export const MAX_VOICE_SECONDS = 120;
// Opus in WebM (Chrome, Edge, Firefox) or Ogg, and AAC in MP4 for Safari.
const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

export const canRecord = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function micError(e) {
  if (!window.isSecureContext) return 'Voice messages need a secure (https) connection.';
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Microphone access is blocked. Allow it in your browser’s site settings to record voice messages.';
  if (e?.name === 'NotFoundError') return 'No microphone was found.';
  if (e?.name === 'NotReadableError') return 'Your microphone is being used by another app.';
  return 'The microphone could not be started.';
}

/**
 * Record from the microphone.
 * state: idle → starting → recording → recorded (a preview you can play, send or discard).
 */
export function useRecorder() {
  const [state, setState] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]); // recent loudness, for the live meter
  const [clip, setClip] = useState(null); // { blob, url, duration, waveform }
  const rec = useRef({});

  const release = useCallback(() => {
    const r = rec.current;
    clearInterval(r.meter);
    clearInterval(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    rec.current = {};
  }, []);
  useEffect(() => release, [release]);

  const stop = useCallback(() => new Promise((resolve) => {
    const r = rec.current;
    if (!r.recorder || r.recorder.state === 'inactive') { resolve(null); return; }
    r.recorder.onstop = () => {
      const duration = Math.min(MAX_VOICE_SECONDS, (performance.now() - r.startedAt) / 1000);
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      const out = { blob, url: URL.createObjectURL(blob), duration, waveform: toWaveform(r.samples) };
      release();
      setClip(out);
      setState('recorded');
      resolve(out);
    };
    r.recorder.stop();
  }), [release]);

  const start = useCallback(async () => {
    if (!canRecord()) { toast(window.isSecureContext ? 'This browser can’t record audio.' : micError(), 'error'); return; }
    setState('starting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setState('idle');
      toast(micError(e), 'error');
      return;
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const r = { stream, recorder, ctx, chunks: [], samples: [], startedAt: performance.now() };
    rec.current = r;
    recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };

    // Loudness (RMS) about 14 times a second: drives the live meter and becomes the message's waveform.
    // A timer rather than animation frames, so the waveform is still captured if you switch tabs while recording.
    r.meter = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      r.samples.push(level);
      setLevels((l) => [...l.slice(-39), level]);
    }, 70);
    r.timer = setInterval(() => {
      const secs = (performance.now() - r.startedAt) / 1000;
      setElapsed(secs);
      if (secs >= MAX_VOICE_SECONDS) { stop(); toast('Voice messages can be up to 2 minutes. Your recording is ready to send.', 'info'); }
    }, 200);
    recorder.start(250);
    setLevels([]);
    setElapsed(0);
    setClip(null);
    setState('recording');
  }, [stop]);

  /** Throw the recording away. */
  const discard = useCallback(() => {
    const r = rec.current;
    if (r.recorder && r.recorder.state !== 'inactive') { r.recorder.onstop = null; r.recorder.stop(); }
    release();
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setState('idle');
  }, [clip, release]);

  /** Back to idle after sending (the blob URL now belongs to the sent message). */
  const reset = useCallback(() => { setClip(null); setState('idle'); }, []);

  return { state, elapsed, levels, clip, start, stop, discard, reset };
}

/* ---------- Playback ---------- */
const urls = new Map(); // server audio URL → blob URL, so each recording downloads once
let playingNow = null; // only one voice message plays at a time

function audioSrc(voice) {
  if (voice.localUrl) return Promise.resolve(voice.localUrl);
  if (!urls.has(voice.url)) {
    urls.set(voice.url, api(voice.url.replace(/^\/api/, ''), { as: 'blob' })
      .then((b) => URL.createObjectURL(b))
      .catch((e) => { urls.delete(voice.url); throw e; }));
  }
  return urls.get(voice.url);
}

const RATES = [1, 1.5, 2];

/** Play button, seekable waveform, time and speed. `onColor` styles it for a blue bubble. */
export function VoicePlayer({ voice, onColor = false }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const audio = useRef(null);
  const raf = useRef(0);
  const duration = voice.duration || 0;
  const bars = voice.waveform?.length ? voice.waveform : Array(40).fill(24);

  useEffect(() => () => { cancelAnimationFrame(raf.current); audio.current?.pause(); }, []);

  const ensure = async () => {
    if (audio.current) return audio.current;
    const a = new Audio(await audioSrc(voice));
    const follow = () => { setPos(a.currentTime); raf.current = requestAnimationFrame(follow); };
    a.onplay = () => { setPlaying(true); raf.current = requestAnimationFrame(follow); };
    a.onpause = () => { setPlaying(false); cancelAnimationFrame(raf.current); };
    a.onended = () => { setPlaying(false); cancelAnimationFrame(raf.current); setPos(0); };
    a.ontimeupdate = () => { if (!a.paused) setPos(a.currentTime); }; // also moves when animation frames are paused (background tab)
    audio.current = a;
    return a;
  };

  const toggle = async () => {
    if (playing) { audio.current.pause(); return; }
    setLoading(true);
    try {
      const a = await ensure();
      if (playingNow && playingNow !== a) playingNow.pause();
      playingNow = a;
      a.playbackRate = rate;
      await a.play();
    } catch (e) {
      toast(e.message && e.name !== 'NotSupportedError' ? e.message : 'This voice message can’t be played in this browser.', 'error');
    } finally { setLoading(false); }
  };

  const seekTo = async (fraction) => {
    const t = Math.max(0, Math.min(1, fraction)) * duration;
    setPos(t);
    try { (await ensure()).currentTime = t; } catch { /* plays from the start instead */ }
  };

  const progress = duration ? Math.min(1, pos / duration) : 0;
  return (
    <div className={`voice ${onColor ? 'on-color' : ''} ${playing ? 'is-playing' : ''}`}>
      <button type="button" className="voice-play" onClick={toggle} aria-label={playing ? 'Pause voice message' : 'Play voice message'}>
        {loading ? <Spinner size={16} /> : playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
      <div className="voice-wave" role="slider" tabIndex={0} aria-label="Position in voice message"
        aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(pos)} aria-valuetext={`${fmtDuration(pos)} of ${fmtDuration(duration)}`}
        onClick={(e) => { const box = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - box.left) / box.width); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); seekTo((pos + 5) / duration); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo((pos - 5) / duration); }
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        }}>
        {bars.map((h, i) => <span key={i} className={(i + 0.5) / bars.length <= progress ? 'on' : ''} style={{ height: `${Math.max(14, h)}%` }} />)}
      </div>
      <span className="voice-time nums">{fmtDuration(playing || pos > 0 ? pos : duration)}</span>
      <button type="button" className="voice-rate" onClick={() => {
        const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
        setRate(next);
        if (audio.current) audio.current.playbackRate = next;
      }} aria-label={`Playback speed ${rate}×`} title="Playback speed">{rate}×</button>
    </div>
  );
}
