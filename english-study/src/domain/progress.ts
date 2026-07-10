import { LEVEL_NUMBERS, type LevelNumber, type ThemeId } from './content';

const STORAGE_KEY = 'little-english-progress-v1';
const THEME_IDS = ['animals', 'fruits', 'food'] as const satisfies readonly ThemeId[];

export type ProgressState = {
  completedLevels: Record<ThemeId, LevelNumber[]>;
  stickers: Record<ThemeId, string[]>;
  recentTheme: ThemeId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

function isLevelNumber(value: unknown): value is LevelNumber {
  return typeof value === 'number' && LEVEL_NUMBERS.includes(value as LevelNumber);
}

function sanitizeLevels(value: unknown): LevelNumber[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter(isLevelNumber))).sort((a, b) => a - b);
}

function sanitizeStickers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((sticker): sticker is string => typeof sticker === 'string'))
  ).sort();
}

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
    const parsed: unknown = JSON.parse(raw);
    const stored = isRecord(parsed) ? parsed : {};
    const completedLevels = isRecord(stored.completedLevels) ? stored.completedLevels : {};
    const stickers = isRecord(stored.stickers) ? stored.stickers : {};

    return {
      completedLevels: {
        animals: sanitizeLevels(completedLevels.animals),
        fruits: sanitizeLevels(completedLevels.fruits),
        food: sanitizeLevels(completedLevels.food)
      },
      stickers: {
        animals: sanitizeStickers(stickers.animals),
        fruits: sanitizeStickers(stickers.fruits),
        food: sanitizeStickers(stickers.food)
      },
      recentTheme: isThemeId(stored.recentTheme) ? stored.recentTheme : initial.recentTheme
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
      [themeId]: Array.from(completed).sort((a, b) => a - b)
    },
    stickers: {
      ...progress.stickers,
      [themeId]: Array.from(stickers).sort()
    }
  };
}

export function getCompletedCount(progress: ProgressState, themeId: ThemeId): number {
  return new Set(progress.completedLevels[themeId]).size;
}
