# English Study PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a touch-first Web/PWA English learning MVP for 3-6 year-old children with Animals, Fruits, and Food themes, level-based lessons, explore mode, local progress, speech playback, speaking interaction, and basic PWA support.

**Architecture:** Create a Vite + React + TypeScript single-page app inside `english-study`. Keep domain logic in small pure modules under `src/domain`, UI in focused React components under `src/components`, and static PWA files under `public`. Use local content data, `localStorage` progress, browser speech synthesis for playback, and a manual service worker for basic app-shell caching.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, Playwright, CSS, browser SpeechSynthesis, localStorage, Web App Manifest, Service Worker.

---

## Scope Check

The approved spec is one cohesive frontend MVP. It does not need separate subsystem plans. The classroom, account, payment, AI scoring, and cloud sync ideas remain outside this implementation.

Before starting UI implementation tasks, invoke `frontend-design` because the user explicitly requested that skill for the frontend phase.

## File Structure

- `package.json`: scripts and frontend/test dependencies.
- `index.html`: Vite app shell and PWA meta tags.
- `tsconfig.json`, `vite.config.ts`: TypeScript, Vite, and Vitest configuration.
- `src/main.tsx`: React bootstrap and service worker registration call.
- `src/App.tsx`: top-level app state wiring and screen routing.
- `src/styles.css`: global responsive child-friendly UI styling.
- `src/vite-env.d.ts`: Vite type declarations.
- `src/test/setup.ts`: Testing Library setup.
- `src/domain/content.ts`: theme, level, and word data with accessors.
- `src/domain/content.test.ts`: coverage for 3 themes, 36 words, and level grouping.
- `src/domain/progress.ts`: local progress load/save/update helpers.
- `src/domain/progress.test.ts`: coverage for completed levels, stickers, and recent theme persistence.
- `src/domain/audio.ts`: speech synthesis wrapper with fallback status.
- `src/domain/audio.test.ts`: coverage for available and unavailable browser speech.
- `src/domain/lesson.ts`: lesson step state machine and answer checking.
- `src/domain/lesson.test.ts`: coverage for Learn, Listen, Speak, Reward flow.
- `src/components/Home.tsx`: theme selection screen.
- `src/components/ThemeScreen.tsx`: Start, Explore, and level island screen.
- `src/components/LessonScreen.tsx`: Learn, Listen, Speak, Reward interaction.
- `src/components/ExploreScreen.tsx`: theme word grid and tap-to-hear behavior.
- `src/components/StickerShelf.tsx`: compact sticker display.
- `src/components/WordCard.tsx`: reusable large tappable word card.
- `src/components/App.test.tsx`: integration tests for primary user journeys.
- `public/manifest.webmanifest`: PWA manifest.
- `public/icon.svg`: scalable app icon for the manifest.
- `public/sw.js`: app-shell service worker.
- `playwright.config.ts`: local browser test configuration.
- `tests/e2e/app.spec.ts`: Playwright smoke tests for desktop and mobile-size flows.
- `docs/superpowers/specs/2026-05-31-english-study-app-design.md`: existing product spec, read-only during implementation unless requirements change.

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/test/setup.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Create package and tool configuration**

Create `package.json`:

```json
{
  "name": "english-study",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@playwright/test": "^1.50.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^2.1.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  }
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Create a minimal app shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1f7a8c" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Little English Quest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <section className="welcome-panel" aria-labelledby="app-title">
        <p className="eyebrow">Little English Quest</p>
        <h1 id="app-title">Pick a world</h1>
        <p className="intro">Animals, fruits, and food are waiting.</p>
      </section>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  color: #17324d;
  background: #f8fbf5;
  font-family: Inter, ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
  display: grid;
  place-items: center;
}

.welcome-panel {
  width: min(720px, 100%);
  padding: 32px;
  border: 3px solid #17324d;
  border-radius: 8px;
  background: #ffffff;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 800;
  color: #1f7a8c;
}

h1 {
  margin: 0;
  font-size: clamp(2.2rem, 8vw, 5rem);
  line-height: 1;
  letter-spacing: 0;
}

.intro {
  max-width: 36rem;
  margin: 16px 0 0;
  font-size: 1.2rem;
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and installation exits with code 0.

- [ ] **Step 4: Run the first build and test commands**

Run:

```bash
npm run build
```

Expected: `npm run build` creates `dist`.

- [ ] **Step 5: Commit bootstrap**

Run:

```bash
git add english-study/package.json english-study/package-lock.json english-study/index.html english-study/tsconfig.json english-study/vite.config.ts english-study/src
git commit -m "feat: scaffold English study PWA"
```

Expected: commit includes only files under `english-study`.

## Task 2: Content Data and Accessors

**Files:**
- Create: `src/domain/content.test.ts`
- Create: `src/domain/content.ts`

- [ ] **Step 1: Write failing content tests**

Create `src/domain/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  getLevelWords,
  getTheme,
  getThemeSummaries,
  getThemeWords,
  themes
} from './content';

describe('content data', () => {
  it('contains three themes and thirty-six words', () => {
    expect(themes).toHaveLength(3);
    expect(themes.map((theme) => theme.id)).toEqual(['animals', 'fruits', 'food']);
    expect(themes.flatMap((theme) => theme.words)).toHaveLength(36);
  });

  it('groups each theme into three levels with four words each', () => {
    for (const theme of themes) {
      expect(theme.words).toHaveLength(12);
      expect(getLevelWords(theme.id, 1)).toHaveLength(4);
      expect(getLevelWords(theme.id, 2)).toHaveLength(4);
      expect(getLevelWords(theme.id, 3)).toHaveLength(4);
    }
  });

  it('returns theme summaries for the home screen', () => {
    expect(getThemeSummaries()).toEqual([
      {
        id: 'animals',
        title: 'Animals',
        emoji: '🐾',
        color: '#1f7a8c',
        wordCount: 12,
        levelCount: 3
      },
      {
        id: 'fruits',
        title: 'Fruits',
        emoji: '🍓',
        color: '#d95d39',
        wordCount: 12,
        levelCount: 3
      },
      {
        id: 'food',
        title: 'Food',
        emoji: '🍞',
        color: '#6a994e',
        wordCount: 12,
        levelCount: 3
      }
    ]);
  });

  it('finds themes and words by id', () => {
    expect(getTheme('animals')?.title).toBe('Animals');
    expect(getThemeWords('fruits').map((word) => word.word)).toContain('banana');
    expect(getLevelWords('food', 3).map((word) => word.word)).toEqual([
      'chicken',
      'soup',
      'pizza',
      'ice cream'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/content.test.ts
```

Expected: FAIL because `src/domain/content.ts` does not exist.

- [ ] **Step 3: Implement content data**

Create `src/domain/content.ts`:

```ts
export type ThemeId = 'animals' | 'fruits' | 'food';
export type LevelNumber = 1 | 2 | 3;

export type WordEntry = {
  id: string;
  word: string;
  zh: string;
  sentence: string;
  theme: ThemeId;
  level: LevelNumber;
  emoji: string;
};

export type Theme = {
  id: ThemeId;
  title: string;
  emoji: string;
  color: string;
  words: WordEntry[];
};

export type ThemeSummary = {
  id: ThemeId;
  title: string;
  emoji: string;
  color: string;
  wordCount: number;
  levelCount: number;
};

const words = {
  animals: [
    ['cat', '猫', 'It is a cat.', 1, '🐱'],
    ['dog', '狗', 'It is a dog.', 1, '🐶'],
    ['bird', '鸟', 'It is a bird.', 1, '🐦'],
    ['fish', '鱼', 'It is a fish.', 1, '🐟'],
    ['rabbit', '兔子', 'It is a rabbit.', 2, '🐰'],
    ['duck', '鸭子', 'It is a duck.', 2, '🦆'],
    ['cow', '奶牛', 'It is a cow.', 2, '🐮'],
    ['pig', '猪', 'It is a pig.', 2, '🐷'],
    ['lion', '狮子', 'It is a lion.', 3, '🦁'],
    ['tiger', '老虎', 'It is a tiger.', 3, '🐯'],
    ['elephant', '大象', 'It is an elephant.', 3, '🐘'],
    ['monkey', '猴子', 'It is a monkey.', 3, '🐵']
  ],
  fruits: [
    ['apple', '苹果', 'It is an apple.', 1, '🍎'],
    ['banana', '香蕉', 'It is a banana.', 1, '🍌'],
    ['orange', '橙子', 'It is an orange.', 1, '🍊'],
    ['grape', '葡萄', 'It is a grape.', 1, '🍇'],
    ['strawberry', '草莓', 'It is a strawberry.', 2, '🍓'],
    ['watermelon', '西瓜', 'It is a watermelon.', 2, '🍉'],
    ['pear', '梨', 'It is a pear.', 2, '🍐'],
    ['peach', '桃子', 'It is a peach.', 2, '🍑'],
    ['mango', '芒果', 'It is a mango.', 3, '🥭'],
    ['pineapple', '菠萝', 'It is a pineapple.', 3, '🍍'],
    ['lemon', '柠檬', 'It is a lemon.', 3, '🍋'],
    ['cherry', '樱桃', 'It is a cherry.', 3, '🍒']
  ],
  food: [
    ['milk', '牛奶', 'It is milk.', 1, '🥛'],
    ['bread', '面包', 'It is bread.', 1, '🍞'],
    ['egg', '鸡蛋', 'It is an egg.', 1, '🥚'],
    ['rice', '米饭', 'It is rice.', 1, '🍚'],
    ['cake', '蛋糕', 'It is a cake.', 2, '🍰'],
    ['cookie', '饼干', 'It is a cookie.', 2, '🍪'],
    ['cheese', '奶酪', 'It is cheese.', 2, '🧀'],
    ['noodles', '面条', 'It is noodles.', 2, '🍜'],
    ['chicken', '鸡肉', 'It is chicken.', 3, '🍗'],
    ['soup', '汤', 'It is soup.', 3, '🥣'],
    ['pizza', '披萨', 'It is pizza.', 3, '🍕'],
    ['ice cream', '冰淇淋', 'It is ice cream.', 3, '🍦']
  ]
} satisfies Record<ThemeId, [string, string, string, LevelNumber, string][]>;

function makeWords(theme: ThemeId): WordEntry[] {
  return words[theme].map(([word, zh, sentence, level, emoji]) => ({
    id: `${theme}-${word.replace(/\s+/g, '-')}`,
    word,
    zh,
    sentence,
    theme,
    level,
    emoji
  }));
}

export const themes: Theme[] = [
  {
    id: 'animals',
    title: 'Animals',
    emoji: '🐾',
    color: '#1f7a8c',
    words: makeWords('animals')
  },
  {
    id: 'fruits',
    title: 'Fruits',
    emoji: '🍓',
    color: '#d95d39',
    words: makeWords('fruits')
  },
  {
    id: 'food',
    title: 'Food',
    emoji: '🍞',
    color: '#6a994e',
    words: makeWords('food')
  }
];

export function getThemeSummaries(): ThemeSummary[] {
  return themes.map((theme) => ({
    id: theme.id,
    title: theme.title,
    emoji: theme.emoji,
    color: theme.color,
    wordCount: theme.words.length,
    levelCount: 3
  }));
}

export function getTheme(themeId: ThemeId): Theme | undefined {
  return themes.find((theme) => theme.id === themeId);
}

export function getThemeWords(themeId: ThemeId): WordEntry[] {
  return getTheme(themeId)?.words ?? [];
}

export function getLevelWords(themeId: ThemeId, level: LevelNumber): WordEntry[] {
  return getThemeWords(themeId).filter((word) => word.level === level);
}
```

- [ ] **Step 4: Run content tests**

Run:

```bash
npm test -- src/domain/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit content**

Run:

```bash
git add english-study/src/domain/content.ts english-study/src/domain/content.test.ts
git commit -m "feat: add English learning content"
```

Expected: commit contains only the content module and its test.

## Task 3: Progress Persistence

**Files:**
- Create: `src/domain/progress.test.ts`
- Create: `src/domain/progress.ts`

- [ ] **Step 1: Write failing progress tests**

Create `src/domain/progress.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  completeLevel,
  createInitialProgress,
  getCompletedCount,
  loadProgress,
  saveProgress,
  type ProgressState
} from './progress';

describe('progress persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates empty progress for every theme', () => {
    expect(createInitialProgress()).toEqual({
      completedLevels: {
        animals: [],
        fruits: [],
        food: []
      },
      stickers: {
        animals: [],
        fruits: [],
        food: []
      },
      recentTheme: 'animals'
    });
  });

  it('saves and loads progress from localStorage', () => {
    const progress: ProgressState = completeLevel(createInitialProgress(), 'fruits', 2);
    saveProgress(progress);

    expect(loadProgress()).toEqual({
      completedLevels: {
        animals: [],
        fruits: [2],
        food: []
      },
      stickers: {
        animals: [],
        fruits: ['fruits-sticker-2'],
        food: []
      },
      recentTheme: 'fruits'
    });
  });

  it('does not duplicate completed levels or stickers', () => {
    const once = completeLevel(createInitialProgress(), 'food', 3);
    const twice = completeLevel(once, 'food', 3);

    expect(twice.completedLevels.food).toEqual([3]);
    expect(twice.stickers.food).toEqual(['food-sticker-3']);
    expect(getCompletedCount(twice, 'food')).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/progress.test.ts
```

Expected: FAIL because `src/domain/progress.ts` does not exist.

- [ ] **Step 3: Implement progress helpers**

Create `src/domain/progress.ts`:

```ts
import type { LevelNumber, ThemeId } from './content';

const STORAGE_KEY = 'little-english-progress-v1';

export type ProgressState = {
  completedLevels: Record<ThemeId, LevelNumber[]>;
  stickers: Record<ThemeId, string[]>;
  recentTheme: ThemeId;
};

export function createInitialProgress(): ProgressState {
  return {
    completedLevels: {
      animals: [],
      fruits: [],
      food: []
    },
    stickers: {
      animals: [],
      fruits: [],
      food: []
    },
    recentTheme: 'animals'
  };
}

export function loadProgress(storage: Storage = localStorage): ProgressState {
  const initial = createInitialProgress();
  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as ProgressState;
    return {
      completedLevels: {
        animals: parsed.completedLevels?.animals ?? [],
        fruits: parsed.completedLevels?.fruits ?? [],
        food: parsed.completedLevels?.food ?? []
      },
      stickers: {
        animals: parsed.stickers?.animals ?? [],
        fruits: parsed.stickers?.fruits ?? [],
        food: parsed.stickers?.food ?? []
      },
      recentTheme: parsed.recentTheme ?? initial.recentTheme
    };
  } catch {
    return initial;
  }
}

export function saveProgress(progress: ProgressState, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function completeLevel(
  progress: ProgressState,
  themeId: ThemeId,
  level: LevelNumber
): ProgressState {
  const completed = new Set(progress.completedLevels[themeId]);
  completed.add(level);

  const stickerId = `${themeId}-sticker-${level}`;
  const stickers = new Set(progress.stickers[themeId]);
  stickers.add(stickerId);

  return {
    ...progress,
    recentTheme: themeId,
    completedLevels: {
      ...progress.completedLevels,
      [themeId]: Array.from(completed).sort()
    },
    stickers: {
      ...progress.stickers,
      [themeId]: Array.from(stickers).sort()
    }
  };
}

export function getCompletedCount(progress: ProgressState, themeId: ThemeId): number {
  return progress.completedLevels[themeId].length;
}
```

- [ ] **Step 4: Run progress tests**

Run:

```bash
npm test -- src/domain/progress.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit progress module**

Run:

```bash
git add english-study/src/domain/progress.ts english-study/src/domain/progress.test.ts
git commit -m "feat: persist learning progress"
```

Expected: commit contains only the progress module and its test.

## Task 4: Lesson State Machine

**Files:**
- Create: `src/domain/lesson.test.ts`
- Create: `src/domain/lesson.ts`

- [ ] **Step 1: Write failing lesson tests**

Create `src/domain/lesson.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getLevelWords } from './content';
import {
  advanceLesson,
  answerListenPrompt,
  createLessonState,
  startSpeaking,
  stopSpeaking
} from './lesson';

describe('lesson state machine', () => {
  const words = getLevelWords('animals', 1);

  it('starts on the learn step with four words', () => {
    const state = createLessonState('animals', 1, words);

    expect(state.step).toBe('learn');
    expect(state.words.map((word) => word.word)).toEqual(['cat', 'dog', 'bird', 'fish']);
    expect(state.promptWord.word).toBe('cat');
  });

  it('moves through learn, listen, speak, and reward steps', () => {
    const listenState = advanceLesson(createLessonState('animals', 1, words));
    expect(listenState.step).toBe('listen');

    const answered = answerListenPrompt(listenState, listenState.promptWord.id);
    expect(answered.feedback).toBe('correct');

    const speaking = startSpeaking(advanceLesson(answered));
    expect(speaking.step).toBe('speak');
    expect(speaking.isRecording).toBe(true);

    const stopped = stopSpeaking(speaking);
    expect(stopped.isRecording).toBe(false);
    expect(advanceLesson(stopped).step).toBe('reward');
  });

  it('gives gentle feedback for wrong listen answers', () => {
    const listenState = advanceLesson(createLessonState('animals', 1, words));
    const answered = answerListenPrompt(listenState, 'animals-dog');

    expect(answered.feedback).toBe('try-again');
    expect(answered.step).toBe('listen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/lesson.test.ts
```

Expected: FAIL because `src/domain/lesson.ts` does not exist.

- [ ] **Step 3: Implement lesson logic**

Create `src/domain/lesson.ts`:

```ts
import type { LevelNumber, ThemeId, WordEntry } from './content';

export type LessonStep = 'learn' | 'listen' | 'speak' | 'reward';
export type LessonFeedback = 'idle' | 'correct' | 'try-again';

export type LessonState = {
  themeId: ThemeId;
  level: LevelNumber;
  words: WordEntry[];
  step: LessonStep;
  promptWord: WordEntry;
  feedback: LessonFeedback;
  isRecording: boolean;
};

export function createLessonState(
  themeId: ThemeId,
  level: LevelNumber,
  words: WordEntry[]
): LessonState {
  return {
    themeId,
    level,
    words,
    step: 'learn',
    promptWord: words[0],
    feedback: 'idle',
    isRecording: false
  };
}

export function advanceLesson(state: LessonState): LessonState {
  if (state.step === 'learn') {
    return { ...state, step: 'listen', feedback: 'idle' };
  }

  if (state.step === 'listen' && state.feedback === 'correct') {
    return { ...state, step: 'speak', feedback: 'idle' };
  }

  if (state.step === 'speak') {
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
  if (state.step !== 'speak') {
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
```

- [ ] **Step 4: Run lesson tests**

Run:

```bash
npm test -- src/domain/lesson.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit lesson state machine**

Run:

```bash
git add english-study/src/domain/lesson.ts english-study/src/domain/lesson.test.ts
git commit -m "feat: add lesson flow state machine"
```

Expected: commit contains only lesson domain files.

## Task 5: Speech Playback Service

**Files:**
- Create: `src/domain/audio.test.ts`
- Create: `src/domain/audio.ts`

- [ ] **Step 1: Write failing audio tests**

Create `src/domain/audio.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/domain/audio.test.ts
```

Expected: FAIL because `src/domain/audio.ts` does not exist.

- [ ] **Step 3: Implement speech player**

Create `src/domain/audio.ts`:

```ts
export type SpeechResult =
  | { ok: true }
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
      if (!synthesis || !createUtterance) {
        return { ok: false, reason: 'speech-unavailable' };
      }

      const utterance = createUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.82;
      utterance.pitch = 1.05;
      synthesis.cancel();
      synthesis.speak(utterance);

      return { ok: true };
    }
  };
}
```

- [ ] **Step 4: Run audio tests**

Run:

```bash
npm test -- src/domain/audio.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit audio module**

Run:

```bash
git add english-study/src/domain/audio.ts english-study/src/domain/audio.test.ts
git commit -m "feat: add speech playback service"
```

Expected: commit contains only audio domain files.

## Task 6: UI Components and App Flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/Home.tsx`
- Create: `src/components/ThemeScreen.tsx`
- Create: `src/components/LessonScreen.tsx`
- Create: `src/components/ExploreScreen.tsx`
- Create: `src/components/StickerShelf.tsx`
- Create: `src/components/WordCard.tsx`
- Create: `src/components/App.test.tsx`

- [ ] **Step 1: Invoke frontend design skill**

Before writing UI code, invoke `frontend-design`. Apply it to the component layout, color system, touch target sizing, responsive constraints, and visual verification.

Expected: implementation notes favor large image-first controls, stable button dimensions, restrained but child-friendly color, and no nested cards.

- [ ] **Step 2: Write failing integration tests**

Create `src/components/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('App flow', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn()
      }
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;

        constructor(text: string) {
          this.text = text;
        }
      }
    });
  });

  it('starts on the three theme home screen', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /Animals/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fruits/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Food/ })).toBeInTheDocument();
  });

  it('opens a theme and explores words', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Animals/ }));
    await user.click(screen.getByRole('button', { name: /Explore/ }));

    expect(screen.getByRole('heading', { name: /Animals words/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cat/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Say/ })).toHaveLength(12);
  });

  it('completes the first animal level and stores progress', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Animals/ }));
    await user.click(screen.getByRole('button', { name: /Start/ }));
    await user.click(screen.getByRole('button', { name: /I know these words/ }));
    await user.click(screen.getByRole('button', { name: /cat/ }));
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.pointer([
      { keys: '[MouseLeft>]', target: screen.getByRole('button', { name: /Hold to say/ }) },
      { keys: '[/MouseLeft]', target: screen.getByRole('button', { name: /Hold to say/ }) }
    ]);
    await user.click(screen.getByRole('button', { name: /Finish/ }));

    expect(screen.getByRole('heading', { name: /Sticker earned/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to theme/ }));
    expect(localStorage.getItem('little-english-progress-v1')).toContain('animals-sticker-1');
  });
});
```

- [ ] **Step 3: Run integration tests to verify they fail**

Run:

```bash
npm test -- src/components/App.test.tsx
```

Expected: FAIL because UI components do not exist and `App.tsx` still renders the temporary shell.

- [ ] **Step 4: Implement reusable components**

Create `src/components/WordCard.tsx`:

```tsx
import type { WordEntry } from '../domain/content';

type WordCardProps = {
  word: WordEntry;
  actionLabel?: string;
  selected?: boolean;
  onClick: (word: WordEntry) => void;
};

export function WordCard({ word, actionLabel = 'Say', selected = false, onClick }: WordCardProps) {
  return (
    <button
      className={`word-card${selected ? ' is-selected' : ''}`}
      type="button"
      onClick={() => onClick(word)}
      aria-label={`${actionLabel} ${word.word}`}
    >
      <span className="word-card__emoji" aria-hidden="true">
        {word.emoji}
      </span>
      <span className="word-card__word">{word.word}</span>
    </button>
  );
}
```

Create `src/components/StickerShelf.tsx`:

```tsx
import type { ThemeId } from '../domain/content';
import type { ProgressState } from '../domain/progress';

type StickerShelfProps = {
  progress: ProgressState;
  themeId: ThemeId;
};

export function StickerShelf({ progress, themeId }: StickerShelfProps) {
  const stickers = progress.stickers[themeId];

  return (
    <div className="sticker-shelf" aria-label={`${stickers.length} stickers earned`}>
      {[1, 2, 3].map((level) => {
        const earned = stickers.includes(`${themeId}-sticker-${level}`);
        return (
          <span className={`sticker${earned ? ' is-earned' : ''}`} key={level} aria-hidden="true">
            ★
          </span>
        );
      })}
    </div>
  );
}
```

Create `src/components/Home.tsx`:

```tsx
import type { ThemeSummary } from '../domain/content';

type HomeProps = {
  themes: ThemeSummary[];
  onSelectTheme: (themeId: ThemeSummary['id']) => void;
};

export function Home({ themes, onSelectTheme }: HomeProps) {
  return (
    <section className="screen home-screen" aria-labelledby="home-title">
      <div className="screen-heading">
        <p className="eyebrow">Little English Quest</p>
        <h1 id="home-title">Pick a world</h1>
      </div>
      <div className="theme-grid">
        {themes.map((theme) => (
          <button
            className="theme-tile"
            key={theme.id}
            type="button"
            style={{ '--theme-color': theme.color } as React.CSSProperties}
            onClick={() => onSelectTheme(theme.id)}
          >
            <span className="theme-tile__emoji" aria-hidden="true">
              {theme.emoji}
            </span>
            <span className="theme-tile__title">{theme.title}</span>
            <span className="theme-tile__meta">{theme.wordCount} words</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement screens and app wiring**

Create `src/components/ThemeScreen.tsx`:

```tsx
import type { LevelNumber, Theme } from '../domain/content';
import { getCompletedCount, type ProgressState } from '../domain/progress';
import { StickerShelf } from './StickerShelf';

type ThemeScreenProps = {
  theme: Theme;
  progress: ProgressState;
  onBack: () => void;
  onStart: (level: LevelNumber) => void;
  onExplore: () => void;
};

export function ThemeScreen({ theme, progress, onBack, onStart, onExplore }: ThemeScreenProps) {
  const completedCount = getCompletedCount(progress, theme.id);
  const nextLevel = Math.min(completedCount + 1, 3) as LevelNumber;

  return (
    <section className="screen theme-screen" aria-labelledby="theme-title">
      <button className="text-button" type="button" onClick={onBack}>
        Home
      </button>
      <div className="screen-heading">
        <span className="hero-emoji" aria-hidden="true">
          {theme.emoji}
        </span>
        <h1 id="theme-title">{theme.title}</h1>
        <p className="intro">{completedCount}/3 levels done</p>
        <StickerShelf progress={progress} themeId={theme.id} />
      </div>
      <div className="action-row">
        <button className="primary-action" type="button" onClick={() => onStart(nextLevel)}>
          Start
        </button>
        <button className="secondary-action" type="button" onClick={onExplore}>
          Explore
        </button>
      </div>
      <div className="level-row" aria-label="Levels">
        {[1, 2, 3].map((level) => {
          const number = level as LevelNumber;
          const complete = progress.completedLevels[theme.id].includes(number);
          return (
            <button
              className={`level-island${complete ? ' is-complete' : ''}`}
              key={level}
              type="button"
              onClick={() => onStart(number)}
            >
              <span>Level {level}</span>
              <strong>{complete ? 'Star' : 'Play'}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

Create `src/components/ExploreScreen.tsx`:

```tsx
import type { Theme, WordEntry } from '../domain/content';
import type { SpeechPlayer } from '../domain/audio';
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
```

Create `src/components/LessonScreen.tsx`:

```tsx
import { useState } from 'react';
import type { LevelNumber, Theme, WordEntry } from '../domain/content';
import type { SpeechPlayer } from '../domain/audio';
import {
  advanceLesson,
  answerListenPrompt,
  createLessonState,
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

export function LessonScreen({ theme, level, player, onBack, onComplete }: LessonScreenProps) {
  const levelWords = theme.words.filter((word) => word.level === level);
  const [lesson, setLesson] = useState(() => createLessonState(theme.id, level, levelWords));

  function say(word: WordEntry) {
    player.speak(word.word);
  }

  if (lesson.step === 'reward') {
    return (
      <section className="screen reward-screen" aria-labelledby="reward-title">
        <div className="reward-badge" aria-hidden="true">
          ★
        </div>
        <h1 id="reward-title">Sticker earned</h1>
        <p className="intro">You finished Level {level}.</p>
        <button className="primary-action" type="button" onClick={onComplete}>
          Back to theme
        </button>
      </section>
    );
  }

  return (
    <section className="screen lesson-screen" aria-labelledby="lesson-title">
      <button className="text-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="screen-heading">
        <p className="eyebrow">{theme.title} · Level {level}</p>
        <h1 id="lesson-title">
          {lesson.step === 'learn' && 'Tap and listen'}
          {lesson.step === 'listen' && `Find ${lesson.promptWord.word}`}
          {lesson.step === 'speak' && `Say ${lesson.promptWord.word}`}
        </h1>
      </div>

      {lesson.step === 'learn' && (
        <>
          <div className="word-grid">
            {lesson.words.map((word) => (
              <WordCard key={word.id} word={word} onClick={say} />
            ))}
          </div>
          <button className="primary-action" type="button" onClick={() => setLesson(advanceLesson(lesson))}>
            I know these words
          </button>
        </>
      )}

      {lesson.step === 'listen' && (
        <>
          <button className="sound-button" type="button" onClick={() => player.speak(lesson.promptWord.word)}>
            Play sound
          </button>
          <div className="word-grid">
            {lesson.words.map((word) => (
              <WordCard
                key={word.id}
                word={word}
                actionLabel="Choose"
                selected={lesson.feedback === 'correct' && word.id === lesson.promptWord.id}
                onClick={(selected) => setLesson(answerListenPrompt(lesson, selected.id))}
              />
            ))}
          </div>
          <p className="feedback" role="status">
            {lesson.feedback === 'correct' ? 'Great listening!' : lesson.feedback === 'try-again' ? 'Listen again.' : ' '}
          </p>
          <button
            className="primary-action"
            type="button"
            disabled={lesson.feedback !== 'correct'}
            onClick={() => setLesson(advanceLesson(lesson))}
          >
            Next
          </button>
        </>
      )}

      {lesson.step === 'speak' && (
        <div className="speak-panel">
          <div className="speak-word" aria-hidden="true">
            {lesson.promptWord.emoji}
          </div>
          <p className="intro">{lesson.promptWord.sentence}</p>
          <button
            className={`mic-button${lesson.isRecording ? ' is-recording' : ''}`}
            type="button"
            onPointerDown={() => setLesson(startSpeaking(lesson))}
            onPointerUp={() => setLesson(stopSpeaking(lesson))}
            onPointerCancel={() => setLesson(stopSpeaking(lesson))}
          >
            Hold to say
          </button>
          <button className="primary-action" type="button" onClick={() => setLesson(advanceLesson(lesson))}>
            Finish
          </button>
        </div>
      )}
    </section>
  );
}
```

Modify `src/App.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { createSpeechPlayer } from './domain/audio';
import { getTheme, getThemeSummaries, type LevelNumber, type ThemeId } from './domain/content';
import { completeLevel, loadProgress, saveProgress } from './domain/progress';
import { ExploreScreen } from './components/ExploreScreen';
import { Home } from './components/Home';
import { LessonScreen } from './components/LessonScreen';
import { ThemeScreen } from './components/ThemeScreen';

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
    const nextProgress = completeLevel(progress, themeId, level);
    setProgress(nextProgress);
    saveProgress(nextProgress);
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
        theme={theme}
        level={route.level}
        player={player}
        onBack={() => setRoute({ name: 'theme', themeId: theme.id })}
        onComplete={() => finishLevel(theme.id, route.level)}
      />
    </main>
  );
}
```

- [ ] **Step 6: Replace CSS with final responsive styling**

Modify `src/styles.css`:

```css
:root {
  color: #17324d;
  background: #f8fbf5;
  font-family: Inter, ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button {
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.app-shell {
  min-height: 100vh;
  padding: clamp(16px, 4vw, 36px);
  background:
    linear-gradient(135deg, rgba(31, 122, 140, 0.12), transparent 32%),
    linear-gradient(315deg, rgba(217, 93, 57, 0.12), transparent 34%),
    #f8fbf5;
}

.screen {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.screen-heading {
  margin-bottom: clamp(20px, 4vw, 36px);
}

.eyebrow {
  margin: 0 0 8px;
  color: #1f7a8c;
  font-size: 1rem;
  font-weight: 900;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #17324d;
  font-size: clamp(2.3rem, 9vw, 5.6rem);
  line-height: 1;
  letter-spacing: 0;
}

.intro {
  max-width: 38rem;
  margin: 14px 0 0;
  color: #476377;
  font-size: clamp(1.1rem, 3vw, 1.45rem);
  line-height: 1.4;
}

.theme-grid,
.word-grid,
.level-row,
.action-row {
  display: grid;
  gap: clamp(14px, 3vw, 24px);
}

.theme-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.theme-tile,
.word-card,
.level-island {
  min-height: 176px;
  border: 3px solid #17324d;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 0 #17324d;
}

.theme-tile {
  padding: 24px;
  display: grid;
  align-content: center;
  text-align: left;
  color: #17324d;
  border-color: var(--theme-color);
  box-shadow: 0 8px 0 var(--theme-color);
}

.theme-tile__emoji,
.hero-emoji,
.word-card__emoji,
.speak-word {
  font-size: clamp(3.5rem, 12vw, 7rem);
  line-height: 1;
}

.theme-tile__title,
.word-card__word {
  margin-top: 14px;
  font-size: clamp(1.6rem, 5vw, 2.5rem);
  font-weight: 900;
}

.theme-tile__meta {
  margin-top: 8px;
  color: #476377;
  font-size: 1.05rem;
  font-weight: 800;
}

.action-row {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 24px;
}

.primary-action,
.secondary-action,
.text-button,
.sound-button,
.mic-button {
  min-height: 64px;
  border: 3px solid #17324d;
  border-radius: 8px;
  padding: 14px 22px;
  font-size: 1.25rem;
  font-weight: 900;
}

.primary-action,
.mic-button {
  background: #ffd166;
  color: #17324d;
}

.secondary-action,
.sound-button {
  background: #7bdff2;
  color: #17324d;
}

.text-button {
  min-height: 48px;
  margin-bottom: 24px;
  background: #ffffff;
  color: #17324d;
}

.level-row {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.level-island {
  padding: 20px;
  display: grid;
  gap: 8px;
  place-items: center;
  color: #17324d;
}

.level-island.is-complete {
  background: #d8f3dc;
}

.word-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  margin-bottom: 24px;
}

.word-card {
  min-height: 168px;
  padding: 18px;
  display: grid;
  place-items: center;
  color: #17324d;
}

.word-card.is-selected {
  background: #d8f3dc;
}

.word-card__word {
  text-transform: lowercase;
}

.feedback {
  min-height: 36px;
  color: #1f7a8c;
  font-size: 1.35rem;
  font-weight: 900;
}

.sticker-shelf {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.sticker {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 3px solid #17324d;
  border-radius: 50%;
  background: #ffffff;
  color: #a7b8c5;
  font-weight: 900;
}

.sticker.is-earned,
.reward-badge {
  background: #ffd166;
  color: #17324d;
}

.speak-panel,
.reward-screen {
  display: grid;
  gap: 20px;
  justify-items: center;
  text-align: center;
}

.mic-button {
  width: min(320px, 100%);
  min-height: 104px;
}

.mic-button.is-recording {
  background: #ef476f;
  color: #ffffff;
}

.reward-badge {
  width: 144px;
  height: 144px;
  display: grid;
  place-items: center;
  border: 4px solid #17324d;
  border-radius: 50%;
  font-size: 5rem;
}

@media (max-width: 560px) {
  .theme-grid,
  .word-grid,
  .level-row,
  .action-row {
    grid-template-columns: 1fr;
  }

  .theme-tile,
  .word-card,
  .level-island {
    min-height: 148px;
  }
}
```

- [ ] **Step 7: Run integration tests**

Run:

```bash
npm test -- src/components/App.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run full unit suite and build**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest tests pass and build succeeds.

- [ ] **Step 9: Commit UI flow**

Run:

```bash
git add english-study/src
git commit -m "feat: build child learning app flow"
```

Expected: commit contains UI components, app wiring, styles, and component tests.

## Task 7: PWA Support

**Files:**
- Modify: `src/main.tsx`
- Create: `public/manifest.webmanifest`
- Create: `public/icon.svg`
- Create: `public/sw.js`

- [ ] **Step 1: Create manifest and icon**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Little English Quest",
  "short_name": "English Quest",
  "description": "A touch-first English learning quest for young children.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f8fbf5",
  "theme_color": "#1f7a8c",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

Create `public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Little English Quest icon">
  <rect width="512" height="512" rx="96" fill="#f8fbf5"/>
  <circle cx="256" cy="214" r="132" fill="#ffd166" stroke="#17324d" stroke-width="24"/>
  <path d="M171 310c42 52 128 52 170 0" fill="none" stroke="#17324d" stroke-width="24" stroke-linecap="round"/>
  <circle cx="209" cy="201" r="22" fill="#17324d"/>
  <circle cx="303" cy="201" r="22" fill="#17324d"/>
  <path d="M139 388h234" stroke="#1f7a8c" stroke-width="32" stroke-linecap="round"/>
  <path d="M178 121l-37-49M334 121l37-49" stroke="#d95d39" stroke-width="28" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Create service worker**

Create `public/sw.js`:

```js
const CACHE_NAME = 'little-english-quest-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});
```

- [ ] **Step 3: Register service worker**

Modify `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

- [ ] **Step 4: Verify PWA files build**

Run:

```bash
npm run build
```

Expected: `dist/manifest.webmanifest`, `dist/icon.svg`, and `dist/sw.js` exist.

- [ ] **Step 5: Commit PWA support**

Run:

```bash
git add english-study/public english-study/src/main.tsx
git commit -m "feat: add PWA shell"
```

Expected: commit contains PWA public files and service worker registration.

## Task 8: Browser Smoke Tests and Final Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/app.spec.ts`

- [ ] **Step 1: Create Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] }
    }
  ]
});
```

- [ ] **Step 2: Create browser smoke tests**

Create `tests/e2e/app.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('home screen shows the three learning worlds', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Animals/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fruits/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Food/ })).toBeVisible();
});

test('child can complete the first animal level', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Animals/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await page.getByRole('button', { name: /I know these words/ }).click();
  await page.getByRole('button', { name: /cat/ }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: /Hold to say/ }).click();
  await page.getByRole('button', { name: /Finish/ }).click();

  await expect(page.getByRole('heading', { name: /Sticker earned/ })).toBeVisible();
});

test('explore mode shows twelve animal words', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Animals/ }).click();
  await page.getByRole('button', { name: /Explore/ }).click();

  await expect(page.getByRole('heading', { name: /Animals words/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Say cat/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Say monkey/ })).toBeVisible();
});
```

- [ ] **Step 3: Run Playwright install if browsers are missing**

Run:

```bash
npx playwright install chromium
```

Expected: Chromium browser dependency is available for Playwright.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npm run build
npm run e2e
```

Expected: all unit tests pass, production build succeeds, and Playwright passes on desktop and mobile projects.

- [ ] **Step 5: Manually verify with the in-app Browser**

Run the dev server:

```bash
npm run dev -- --port 4173
```

Open `http://127.0.0.1:4173` in the in-app Browser and verify:

- Home screen has three large theme choices.
- Mobile viewport has no overlapping text.
- Animals -> Start reaches Learn, Listen, Speak, and Reward.
- Animals -> Explore shows 12 tappable words.
- Refresh after finishing a level keeps the earned sticker.
- Console has no runtime errors.

Expected: visual and interaction checks pass.

- [ ] **Step 6: Commit verification tests**

Run:

```bash
git add english-study/playwright.config.ts english-study/tests/e2e/app.spec.ts
git commit -m "test: add app smoke tests"
```

Expected: commit contains only Playwright config and e2e tests.

## Self-Review

Spec coverage:

- Child-led PWA: Tasks 1, 6, 7, and 8.
- Three themes and 36 words: Task 2.
- Level-based learning flow: Tasks 4 and 6.
- Explore mode: Tasks 2, 6, and 8.
- Local progress and stickers: Tasks 3, 6, and 8.
- Speech playback and speaking interaction: Tasks 5 and 6.
- PWA manifest and service worker: Task 7.
- Mobile and desktop verification: Task 8.

Type consistency:

- `ThemeId`, `LevelNumber`, and `WordEntry` originate in `src/domain/content.ts`.
- `ProgressState` originates in `src/domain/progress.ts`.
- `SpeechPlayer` originates in `src/domain/audio.ts`.
- `LessonState` stays internal to `src/domain/lesson.ts` and `LessonScreen.tsx`.

Command coverage:

- Unit verification uses `npm test`.
- Production verification uses `npm run build`.
- Browser verification uses `npm run e2e` and the in-app Browser at `http://127.0.0.1:4173`.
