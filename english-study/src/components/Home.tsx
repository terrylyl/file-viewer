import type { CSSProperties } from 'react';
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
            style={{ '--theme-color': theme.color } as CSSProperties}
            onClick={() => onSelectTheme(theme.id)}
          >
            <span className="theme-tile__art" aria-hidden="true">
              <img src={theme.image} alt="" />
            </span>
            <span className="theme-tile__title">{theme.title}</span>
            <span className="theme-tile__meta">{theme.wordCount} words</span>
          </button>
        ))}
      </div>
    </section>
  );
}
