import type { SpeechPlayer } from '../domain/audio';
import type { Theme, WordEntry } from '../domain/content';
import { WordCard } from './WordCard';

type ExploreScreenProps = {
  theme: Theme;
  player: SpeechPlayer;
  onBack: () => void;
};

export function ExploreScreen({ theme, player, onBack }: ExploreScreenProps) {
  function say(word: WordEntry) {
    player.speak(word.word);
  }

  return (
    <section className="screen explore-screen" aria-labelledby="explore-title">
      <button className="text-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="screen-heading">
        <h1 id="explore-title">{theme.title} words</h1>
      </div>
      <div className="word-grid">
        {theme.words.map((word) => (
          <WordCard key={word.id} word={word} onClick={say} />
        ))}
      </div>
    </section>
  );
}
