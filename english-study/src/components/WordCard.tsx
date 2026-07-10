import type { WordEntry } from '../domain/content';

type WordCardProps = {
  word: WordEntry;
  actionLabel?: string;
  selected?: boolean;
  incorrect?: boolean;
  concealLabel?: boolean;
  onClick: (word: WordEntry) => void;
};

export function WordCard({
  word,
  actionLabel = 'Say',
  selected = false,
  incorrect = false,
  concealLabel = false,
  onClick
}: WordCardProps) {
  return (
    <button
      className={`word-card${selected ? ' is-selected' : ''}${incorrect ? ' is-incorrect' : ''}`}
      type="button"
      onClick={() => onClick(word)}
      aria-label={`${actionLabel} ${word.word}`}
    >
      <span className="word-card__art" aria-hidden="true">
        <img src={word.image} alt="" loading="lazy" />
      </span>
      {!concealLabel && (
        <span className="word-card__copy">
          <span className="word-card__word">{word.word}</span>
          <span className="word-card__meaning">{word.zh}</span>
        </span>
      )}
      {concealLabel && <span className="word-card__mystery" aria-hidden="true">Tap the picture</span>}
    </button>
  );
}
