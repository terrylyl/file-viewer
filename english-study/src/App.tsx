import { useMemo, useState } from 'react';
import { ExploreScreen } from './components/ExploreScreen';
import { Home } from './components/Home';
import { LessonScreen } from './components/LessonScreen';
import { ThemeScreen } from './components/ThemeScreen';
import { createSpeechPlayer } from './domain/audio';
import { getTheme, getThemeSummaries, type LevelNumber, type ThemeId } from './domain/content';
import { completeLevel, loadProgress, saveProgress } from './domain/progress';

type Route =
  | { name: 'home' }
  | { name: 'theme'; themeId: ThemeId }
  | { name: 'lesson'; themeId: ThemeId; level: LevelNumber }
  | { name: 'explore'; themeId: ThemeId };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [progress, setProgress] = useState(() => loadProgress());
  const player = useMemo(() => createSpeechPlayer(), []);

  function finishLevel(themeId: ThemeId, level: LevelNumber) {
    setProgress((current) => {
      const nextProgress = completeLevel(current, themeId, level);
      saveProgress(nextProgress);
      return nextProgress;
    });
    setRoute({ name: 'theme', themeId });
  }

  if (route.name === 'home') {
    return (
      <main className="app-shell">
        <Home themes={getThemeSummaries()} onSelectTheme={(themeId) => setRoute({ name: 'theme', themeId })} />
      </main>
    );
  }

  const theme = getTheme(route.themeId);

  if (!theme) {
    return (
      <main className="app-shell">
        <button className="primary-action" type="button" onClick={() => setRoute({ name: 'home' })}>
          Home
        </button>
      </main>
    );
  }

  if (route.name === 'theme') {
    return (
      <main className="app-shell">
        <ThemeScreen
          theme={theme}
          progress={progress}
          onBack={() => setRoute({ name: 'home' })}
          onStart={(level) => setRoute({ name: 'lesson', themeId: theme.id, level })}
          onExplore={() => setRoute({ name: 'explore', themeId: theme.id })}
        />
      </main>
    );
  }

  if (route.name === 'explore') {
    return (
      <main className="app-shell">
        <ExploreScreen theme={theme} player={player} onBack={() => setRoute({ name: 'theme', themeId: theme.id })} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <LessonScreen
        key={`${theme.id}-${route.level}`}
        theme={theme}
        level={route.level}
        player={player}
        onBack={() => setRoute({ name: 'theme', themeId: theme.id })}
        onComplete={() => finishLevel(theme.id, route.level)}
      />
    </main>
  );
}
