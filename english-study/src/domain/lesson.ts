import type { LevelNumber, ThemeId, WordEntry } from './content';

export const LESSON_WORD_COUNT = 4;

export type LessonStep = 'learn' | 'listen' | 'speak' | 'reward';
export type LessonFeedback = 'idle' | 'correct' | 'try-again';
export type SpeakingOutcome = 'recorded' | 'skipped' | null;

export type LessonState = {
  themeId: ThemeId;
  level: LevelNumber;
  words: WordEntry[];
  listenOptions: WordEntry[];
  step: LessonStep;
  promptWord: WordEntry;
  feedback: LessonFeedback;
  isRecording: boolean;
  canSkipSpeaking: boolean;
  speakingOutcome: SpeakingOutcome;
};

type RandomSource = () => number;

function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function createLessonState(
  themeId: ThemeId,
  level: LevelNumber,
  words: WordEntry[],
  random: RandomSource = Math.random
): LessonState {
  if (words.length === 0) {
    throw new Error('Lesson requires at least one word.');
  }

  const lessonWords = shuffled(words, random).slice(0, LESSON_WORD_COUNT);
  const promptWord = lessonWords[0];

  return {
    themeId,
    level,
    words: lessonWords,
    listenOptions: shuffled(lessonWords, random),
    step: 'learn',
    promptWord,
    feedback: 'idle',
    isRecording: false,
    canSkipSpeaking: false,
    speakingOutcome: null
  };
}

export function advanceLesson(state: LessonState): LessonState {
  if (state.step === 'learn') {
    return { ...state, step: 'listen', feedback: 'idle' };
  }

  if (state.step === 'listen' && state.feedback === 'correct') {
    return { ...state, step: 'speak', feedback: 'idle' };
  }

  if (state.step === 'speak' && state.speakingOutcome) {
    return { ...state, step: 'reward', feedback: 'idle', isRecording: false };
  }

  return state;
}

export function answerListenPrompt(state: LessonState, wordId: string): LessonState {
  if (state.step !== 'listen') {
    return state;
  }

  return {
    ...state,
    feedback: wordId === state.promptWord.id ? 'correct' : 'try-again'
  };
}

export function startSpeaking(state: LessonState): LessonState {
  if (state.step !== 'speak' || state.speakingOutcome) {
    return state;
  }

  return { ...state, isRecording: true };
}

export function stopSpeaking(state: LessonState): LessonState {
  if (state.step !== 'speak') {
    return state;
  }

  return { ...state, isRecording: false };
}

export function completeSpeaking(state: LessonState): LessonState {
  if (state.step !== 'speak') {
    return state;
  }

  return { ...state, isRecording: false, speakingOutcome: 'recorded' };
}

export function allowSpeakingSkip(state: LessonState): LessonState {
  if (state.step !== 'speak') {
    return state;
  }

  return { ...state, isRecording: false, canSkipSpeaking: true };
}

export function skipSpeaking(state: LessonState): LessonState {
  if (state.step !== 'speak' || !state.canSkipSpeaking) {
    return state;
  }

  return { ...state, isRecording: false, speakingOutcome: 'skipped' };
}
