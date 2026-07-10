export type SpeechResult =
  | { ok: true }
  | { ok: true; skipped: 'empty-text' }
  | { ok: false; reason: 'speech-unavailable' };

export type SpeechPlayer = {
  speak(text: string): SpeechResult;
};

type SpeechPlayerOptions = {
  synthesis?: SpeechSynthesis;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
};

export function createSpeechPlayer(options: SpeechPlayerOptions = {}): SpeechPlayer {
  const synthesis =
    options.synthesis ??
    (typeof window !== 'undefined' ? window.speechSynthesis : undefined);
  const createUtterance =
    options.createUtterance ??
    (typeof window !== 'undefined' && window.SpeechSynthesisUtterance
      ? (text: string) => new window.SpeechSynthesisUtterance(text)
      : undefined);

  return {
    speak(text: string): SpeechResult {
      const normalizedText = text.trim();

      if (!normalizedText) {
        return { ok: true, skipped: 'empty-text' };
      }

      if (!synthesis || !createUtterance) {
        return { ok: false, reason: 'speech-unavailable' };
      }

      const utterance = createUtterance(normalizedText);
      utterance.lang = 'en-US';
      utterance.rate = 0.82;
      utterance.pitch = 1.05;
      synthesis.cancel();
      synthesis.speak(utterance);

      return { ok: true };
    }
  };
}
