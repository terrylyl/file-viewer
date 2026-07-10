import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { SpeechPlayer } from '../domain/audio';
import type { LevelNumber, Theme, WordEntry } from '../domain/content';
import {
  advanceLesson,
  allowSpeakingSkip,
  answerListenPrompt,
  completeSpeaking,
  createLessonState,
  skipSpeaking,
  startSpeaking,
  stopSpeaking
} from '../domain/lesson';
import { WordCard } from './WordCard';

type LessonScreenProps = {
  theme: Theme;
  level: LevelNumber;
  player: SpeechPlayer;
  onBack: () => void;
  onComplete: () => void;
};

type VoiceCapture = {
  recorder?: MediaRecorder;
  stream?: MediaStream;
  chunks: Blob[];
  stopWhenReady: boolean;
};

export function LessonScreen({ theme, level, player, onBack, onComplete }: LessonScreenProps) {
  const levelWords = theme.words.filter((word) => word.level === level);
  const [lesson, setLesson] = useState(() => createLessonState(theme.id, level, levelWords));
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState('Press and hold when you are ready.');
  const voiceCapture = useRef<VoiceCapture | null>(null);
  const voiceUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      voiceCapture.current?.stream?.getTracks().forEach((track) => track.stop());
      if (voiceUrlRef.current) URL.revokeObjectURL(voiceUrlRef.current);
    };
  }, []);

  function say(word: WordEntry) {
    player.speak(word.word);
  }

  function beginListen() {
    player.speak(lesson.promptWord.word);
    setLesson((current) => advanceLesson(current));
  }

  function chooseListenAnswer(selected: WordEntry) {
    const correct = selected.id === lesson.promptWord.id;
    setLesson((current) => answerListenPrompt(current, selected.id));
    if (!correct) player.speak(lesson.promptWord.word);
  }

  function isSpeakKey(event: KeyboardEvent<HTMLButtonElement>) {
    return event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter';
  }

  function handleSpeakKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!isSpeakKey(event) || event.repeat) return;
    event.preventDefault();
    void startVoiceCapture();
  }

  function handleSpeakKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (!isSpeakKey(event)) return;
    event.preventDefault();
    stopVoiceCapture();
  }

  function handleSpeakPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void startVoiceCapture();
  }

  function handleSpeakPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopVoiceCapture();
  }

  function makeSpeakingSkippable(message: string) {
    setLesson((current) => allowSpeakingSkip(stopSpeaking(current)));
    setVoiceMessage(message);
  }

  async function startVoiceCapture() {
    if (voiceCapture.current || lesson.speakingOutcome) return;

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      makeSpeakingSkippable('Microphone recording is not available here. You can skip this turn.');
      return;
    }

    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current);
      voiceUrlRef.current = null;
      setVoiceUrl(null);
    }

    const capture: VoiceCapture = { chunks: [], stopWhenReady: false };
    voiceCapture.current = capture;
    setLesson((current) => startSpeaking(current));
    setVoiceMessage('Listening… let go when you finish.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      capture.stream = stream;
      const recorder = new MediaRecorder(stream);
      capture.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) capture.chunks.push(event.data);
      };
      recorder.onstop = () => finishVoiceCapture(capture);
      recorder.start();
      if (capture.stopWhenReady) stopVoiceCapture();
    } catch {
      finishVoiceCapture(capture, 'Microphone access was blocked. You can skip this turn.');
    }
  }

  function stopVoiceCapture() {
    const capture = voiceCapture.current;
    setLesson((current) => stopSpeaking(current));

    if (!capture) return;
    if (!capture.recorder) {
      capture.stopWhenReady = true;
      return;
    }
    if (capture.recorder.state === 'recording') capture.recorder.stop();
  }

  function finishVoiceCapture(capture: VoiceCapture, errorMessage?: string) {
    if (voiceCapture.current !== capture) return;

    capture.stream?.getTracks().forEach((track) => track.stop());
    voiceCapture.current = null;

    if (errorMessage || capture.chunks.length === 0) {
      makeSpeakingSkippable(errorMessage ?? 'No voice was captured. Try again or skip this turn.');
      return;
    }

    const type = capture.recorder?.mimeType || capture.chunks[0].type || 'audio/webm';
    const nextUrl = URL.createObjectURL(new Blob(capture.chunks, { type }));
    voiceUrlRef.current = nextUrl;
    setVoiceUrl(nextUrl);
    setLesson((current) => completeSpeaking(current));
    setVoiceMessage('Great speaking! You can listen back or finish the lesson.');
  }

  function handleSkipSpeaking() {
    setLesson((current) => skipSpeaking(current));
    setVoiceMessage('Speaking skipped for this turn.');
  }

  if (lesson.step === 'reward') {
    return (
      <section className="screen reward-screen" aria-labelledby="reward-title">
        <div className="reward-badge" aria-hidden="true">★</div>
        <p className="eyebrow">Level {level} complete</p>
        <h1 id="reward-title">Sticker earned!</h1>
        <p className="intro">You explored {lesson.words.map((word) => word.word).join(', ')}.</p>
        <button className="primary-action" type="button" onClick={onComplete}>Back to theme</button>
      </section>
    );
  }

  const stepNumber = lesson.step === 'learn' ? 1 : lesson.step === 'listen' ? 2 : 3;

  return (
    <section className="screen lesson-screen" aria-labelledby="lesson-title">
      <div className="lesson-toolbar">
        <button className="text-button" type="button" onClick={onBack}>Back</button>
        <div className="step-meter" aria-label={`Step ${stepNumber} of 3`}>
          {[1, 2, 3].map((step) => <span className={step <= stepNumber ? 'is-active' : ''} key={step} />)}
        </div>
      </div>

      <div className="screen-heading lesson-heading">
        <p className="eyebrow">{theme.title} · Level {level} · 4 surprise words</p>
        <h1 id="lesson-title">
          {lesson.step === 'learn' && 'Look, tap, listen'}
          {lesson.step === 'listen' && `Can you find “${lesson.promptWord.word}”?`}
          {lesson.step === 'speak' && `Your turn: say “${lesson.promptWord.word}”`}
        </h1>
      </div>

      {lesson.step === 'learn' && (
        <>
          <div className="word-grid lesson-word-grid">
            {lesson.words.map((word) => <WordCard key={word.id} word={word} onClick={say} />)}
          </div>
          <button className="primary-action lesson-next" type="button" onClick={beginListen}>Ready for a listening game</button>
        </>
      )}

      {lesson.step === 'listen' && (
        <>
          <button className="sound-button" type="button" onClick={() => player.speak(lesson.promptWord.word)}>
            <span aria-hidden="true">▶</span> Play the word again
          </button>
          <div className="word-grid lesson-word-grid listen-grid">
            {lesson.listenOptions.map((word) => (
              <WordCard
                key={word.id}
                word={word}
                actionLabel="Choose"
                concealLabel
                selected={lesson.feedback === 'correct' && word.id === lesson.promptWord.id}
                onClick={chooseListenAnswer}
              />
            ))}
          </div>
          <p className="feedback" role="status">
            {lesson.feedback === 'correct' ? 'You found it! Great listening.' : lesson.feedback === 'try-again' ? 'Good try. Listen once more.' : 'Choose the picture you heard.'}
          </p>
          <button className="primary-action lesson-next" type="button" disabled={lesson.feedback !== 'correct'} onClick={() => setLesson((current) => advanceLesson(current))}>Next: speaking</button>
        </>
      )}

      {lesson.step === 'speak' && (
        <div className="speak-panel">
          <div className="speak-art" aria-hidden="true"><img src={lesson.promptWord.image} alt="" /></div>
          <div>
            <p className="speak-label">{lesson.promptWord.word}</p>
            <p className="intro">{lesson.promptWord.sentence}</p>
          </div>
          <button className="sound-button compact" type="button" onClick={() => player.speak(lesson.promptWord.word)}>Hear the word</button>
          <button
            className={`mic-button${lesson.isRecording ? ' is-recording' : ''}${lesson.speakingOutcome ? ' is-complete' : ''}`}
            type="button"
            aria-pressed={lesson.isRecording}
            disabled={Boolean(lesson.speakingOutcome)}
            onPointerDown={handleSpeakPointerDown}
            onPointerUp={handleSpeakPointerEnd}
            onPointerCancel={handleSpeakPointerEnd}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={handleSpeakKeyDown}
            onKeyUp={handleSpeakKeyUp}
          >
            {lesson.isRecording ? 'Listening… let go' : lesson.speakingOutcome === 'recorded' ? 'Speaking complete ✓' : 'Press and hold to speak'}
          </button>
          <p className="feedback" role="status" aria-live="polite">{voiceMessage}</p>
          {voiceUrl && <audio className="voice-playback" controls src={voiceUrl} aria-label="Hear your voice" />}
          {lesson.canSkipSpeaking && !lesson.speakingOutcome && (
            <button className="skip-action" type="button" onClick={handleSkipSpeaking}>Skip speaking this time</button>
          )}
          <button className="primary-action lesson-next" type="button" disabled={!lesson.speakingOutcome} onClick={() => setLesson((current) => advanceLesson(current))}>Finish lesson</button>
        </div>
      )}
    </section>
  );
}
