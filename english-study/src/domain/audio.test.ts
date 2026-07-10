import { describe, expect, it, vi } from 'vitest';
import { createSpeechPlayer } from './audio';

describe('speech player', () => {
  it('speaks English text when speech synthesis is available', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const utterances: SpeechSynthesisUtterance[] = [];
    const player = createSpeechPlayer({
      synthesis: { speak, cancel } as unknown as SpeechSynthesis,
      createUtterance: (text) => {
        const utterance = { text, lang: '', rate: 1, pitch: 1 } as SpeechSynthesisUtterance;
        utterances.push(utterance);
        return utterance;
      }
    });

    const result = player.speak('cat');

    expect(result).toEqual({ ok: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith(utterances[0]);
    expect(utterances[0].lang).toBe('en-US');
    expect(utterances[0].rate).toBe(0.82);
  });

  it('skips whitespace text without touching speech synthesis', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const createUtterance = vi.fn();
    const player = createSpeechPlayer({
      synthesis: { speak, cancel } as unknown as SpeechSynthesis,
      createUtterance
    });

    const result = player.speak('   ');

    expect(result).toEqual({ ok: true, skipped: 'empty-text' });
    expect(createUtterance).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

  it('trims non-empty text before creating an utterance', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const createUtterance = vi.fn((text: string) => {
      return { text, lang: '', rate: 1, pitch: 1 } as SpeechSynthesisUtterance;
    });
    const player = createSpeechPlayer({
      synthesis: { speak, cancel } as unknown as SpeechSynthesis,
      createUtterance
    });

    player.speak('  cat  ');

    expect(createUtterance).toHaveBeenCalledWith('cat');
  });

  it('returns an unavailable result without browser speech support', () => {
    const player = createSpeechPlayer({
      synthesis: undefined,
      createUtterance: undefined
    });

    expect(player.speak('cat')).toEqual({
      ok: false,
      reason: 'speech-unavailable'
    });
  });
});
