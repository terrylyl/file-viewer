import { describe, expect, it } from 'vitest';
import { getLevelWords } from './content';
import {
  advanceLesson,
  allowSpeakingSkip,
  answerListenPrompt,
  completeSpeaking,
  createLessonState,
  skipSpeaking,
  startSpeaking,
  stopSpeaking
} from './lesson';

describe('lesson state machine', () => {
  const words = getLevelWords('animals', 1);
  const fixedRandom = () => 0;

  it('samples four unique words from the selected level', () => {
    const state = createLessonState('animals', 1, words, fixedRandom);

    expect(state.step).toBe('learn');
    expect(state.words).toHaveLength(4);
    expect(new Set(state.words.map((word) => word.id)).size).toBe(4);
    expect(state.words.every((word) => word.level === 1)).toBe(true);
    expect(state.listenOptions.map((word) => word.id).sort()).toEqual(
      state.words.map((word) => word.id).sort()
    );
  });

  it('uses the available words when a lesson contains fewer than four', () => {
    const state = createLessonState('animals', 1, words.slice(0, 2), fixedRandom);

    expect(state.words).toHaveLength(2);
  });

  it('rejects lessons without words', () => {
    expect(() => createLessonState('animals', 1, [])).toThrow(
      'Lesson requires at least one word.'
    );
  });

  it('requires a correct listen answer and a completed recording', () => {
    const learn = createLessonState('animals', 1, words, fixedRandom);
    const listen = advanceLesson(learn);
    expect(listen.step).toBe('listen');
    expect(advanceLesson(listen)).toBe(listen);

    const answered = answerListenPrompt(listen, listen.promptWord.id);
    const speak = advanceLesson(answered);
    expect(speak.step).toBe('speak');
    expect(advanceLesson(speak)).toBe(speak);

    const recording = startSpeaking(speak);
    const stopped = stopSpeaking(recording);
    expect(advanceLesson(stopped)).toBe(stopped);

    const completed = completeSpeaking(stopped);
    expect(completed.speakingOutcome).toBe('recorded');
    expect(advanceLesson(completed).step).toBe('reward');
  });

  it('allows an explicit skip only after recording becomes unavailable', () => {
    const learn = createLessonState('animals', 1, words, fixedRandom);
    const listen = advanceLesson(learn);
    const answered = answerListenPrompt(listen, listen.promptWord.id);
    const speak = advanceLesson(answered);

    expect(skipSpeaking(speak)).toBe(speak);

    const unavailable = allowSpeakingSkip(speak);
    expect(unavailable.canSkipSpeaking).toBe(true);
    expect(skipSpeaking(unavailable).speakingOutcome).toBe('skipped');
    expect(advanceLesson(skipSpeaking(unavailable)).step).toBe('reward');
  });

  it('gives gentle feedback for wrong listen answers', () => {
    const listen = advanceLesson(createLessonState('animals', 1, words, fixedRandom));
    const wrong = listen.listenOptions.find((word) => word.id !== listen.promptWord.id)!;
    const answered = answerListenPrompt(listen, wrong.id);

    expect(answered.feedback).toBe('try-again');
    expect(answered.step).toBe('listen');
  });

  it('ignores step-specific actions outside their step', () => {
    const learn = createLessonState('animals', 1, words, fixedRandom);
    const listen = advanceLesson(learn);
    const answered = answerListenPrompt(listen, listen.promptWord.id);
    const speak = advanceLesson(answered);
    const reward = advanceLesson(completeSpeaking(speak));

    expect(answerListenPrompt(learn, learn.promptWord.id)).toBe(learn);
    expect(answerListenPrompt(speak, speak.promptWord.id)).toBe(speak);
    expect(startSpeaking(learn)).toBe(learn);
    expect(stopSpeaking(listen)).toBe(listen);
    expect(completeSpeaking(reward)).toBe(reward);
    expect(allowSpeakingSkip(reward)).toBe(reward);
    expect(skipSpeaking(reward)).toBe(reward);
    expect(advanceLesson(reward)).toBe(reward);
  });
});
