import { LEVEL_NUMBERS, type ThemeId } from '../domain/content';
import type { ProgressState } from '../domain/progress';

type StickerShelfProps = {
  progress: ProgressState;
  themeId: ThemeId;
};

export function StickerShelf({ progress, themeId }: StickerShelfProps) {
  const stickers = progress.stickers[themeId];

  return (
    <div className="sticker-shelf" aria-label={`${stickers.length} stickers earned`}>
      {LEVEL_NUMBERS.map((level) => {
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
