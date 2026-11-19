let cachedVoices: SpeechSynthesisVoice[] = [];
let fallbackAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

function loadVoices(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    cachedVoices = window.speechSynthesis.getVoices() || [];
  }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function playOnlineTTSFallback(text: string): void {
  try {
    if (fallbackAudio) {
      fallbackAudio.pause();
      fallbackAudio = null;
    }
    fallbackAudio = new Audio(
      `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=ja&dt=t&q=${encodeURIComponent(text)}`
    );
    fallbackAudio.playbackRate = 0.95;
    fallbackAudio.play().catch(() => {});
  } catch {
    // Ignore audio fallback errors in headless or restricted environments
  }
}

export function speakJP(text: string): void {
  const cleanText = text.replace(/[()（）]/g, '').trim();
  if (!cleanText || typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) {
    playOnlineTTSFallback(cleanText);
    return;
  }
  loadVoices();
  const jpVoice = cachedVoices.find(
    v => v.lang && (v.lang.toLowerCase().includes('ja') || v.lang.toLowerCase().includes('jp'))
  );
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  if (jpVoice) utterance.voice = jpVoice;
  activeUtterance = utterance;
  let started = false;
  utterance.onstart = () => {
    started = true;
  };
  utterance.onerror = () => {
    if (!started) playOnlineTTSFallback(cleanText);
  };
  setTimeout(() => {
    if (activeUtterance !== utterance) return;
    window.speechSynthesis.speak(utterance);
    if (!jpVoice) {
      setTimeout(() => {
        if (!started && !window.speechSynthesis.speaking) {
          playOnlineTTSFallback(cleanText);
        }
      }, 600);
    }
  }, 50);
}
