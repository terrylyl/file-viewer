import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/domain/content.ts'), 'utf8');
const iconSet = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/@iconify-json/openmoji/icons.json'), 'utf8')
);
const charMap = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/@iconify-json/openmoji/chars.json'), 'utf8')
);
const outputRoot = path.join(root, 'public/illustrations');

const entries = [...source.matchAll(/^\s*\['([^']+)',\s*'([^']+)',\s*(\d),\s*'([^']+)'\],?$/gm)].map(
  ([, word, zh, level, sourceIcon], index) => ({
    word,
    zh,
    level: Number(level),
    sourceIcon,
    theme: index < 50 ? 'animals' : index < 100 ? 'fruits' : 'food'
  })
);

if (entries.length !== 150) {
  throw new Error(`Expected 150 content entries, found ${entries.length}.`);
}

const stroke = 'stroke="#172f45" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

function wrap(body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" role="img" aria-label="${label}">${body}</svg>\n`;
}

function berry(color, leaf = '#5c9e45') {
  return `<g ${stroke}><circle fill="${color}" cx="13" cy="14" r="4"/><circle fill="${color}" cx="19" cy="12" r="4"/><circle fill="${color}" cx="23" cy="17" r="4"/><circle fill="${color}" cx="16" cy="20" r="4"/><circle fill="${color}" cx="21" cy="23" r="3.5"/><path fill="${leaf}" d="M17 9c1-4 5-5 8-4-1 4-4 6-8 4Z"/></g>`;
}

function roundFruit(skin, flesh = skin, seed = '#7a4930') {
  return `<g ${stroke}><circle fill="${skin}" cx="14" cy="18" r="9"/><path fill="#63a64b" d="M14 9c1-4 5-6 8-4-1 4-4 6-8 4Z"/><path d="M14 9V6"/><circle fill="${flesh}" cx="24" cy="21" r="7"/><circle fill="${seed}" stroke="none" cx="24" cy="21" r="1.2"/></g>`;
}

function ovalFruit(skin, flesh, seeds = '#342c2a') {
  return `<g ${stroke}><ellipse fill="${skin}" cx="14" cy="18" rx="8" ry="12"/><path fill="#62a64b" d="M13 7c2-4 6-4 8-2-2 3-5 4-8 2Z"/><ellipse fill="${flesh}" cx="24" cy="19" rx="7" ry="10"/><g fill="${seeds}" stroke="none"><circle cx="23" cy="15" r=".8"/><circle cx="26" cy="18" r=".8"/><circle cx="22" cy="21" r=".8"/><circle cx="25" cy="24" r=".8"/></g></g>`;
}

function cluster(color, leaf = '#579447') {
  return `<g ${stroke}><path d="M19 7c0-3 2-4 4-5"/><path fill="${leaf}" d="M18 8c-4-5-8-3-9 0 3 2 6 2 9 0Z"/>${[[13,13],[19,12],[24,15],[11,19],[17,18],[23,21],[15,24],[21,27]].map(([x,y]) => `<ellipse fill="${color}" cx="${x}" cy="${y}" rx="3.5" ry="4.5"/>`).join('')}</g>`;
}

const custom = {
  blueberry: () => berry('#5067b7'),
  raspberry: () => berry('#dd3e64'),
  blackberry: () => berry('#3b294f'),
  papaya: () => ovalFruit('#f3a33a', '#ffca62'),
  plum: () => roundFruit('#76509d', '#d58bb6'),
  apricot: () => roundFruit('#f49b45', '#ffc26d'),
  fig: () => `<g ${stroke}><path fill="#745094" d="M8 21c0-7 8-10 10-17 2 7 10 10 10 17 0 7-5 11-10 11S8 28 8 21Z"/><path fill="#ef91a7" d="M19 11c4 5 6 7 6 11 0 4-3 7-6 7s-6-3-6-7c0-4 2-6 6-11Z"/><g fill="#f5d46d" stroke="none"><circle cx="17" cy="19" r=".8"/><circle cx="21" cy="20" r=".8"/><circle cx="18" cy="24" r=".8"/><circle cx="22" cy="25" r=".8"/></g></g>`,
  guava: () => roundFruit('#7ebf59', '#ef8ba7'),
  lychee: () => cluster('#e95b61'),
  'dragon fruit': () => `<g ${stroke}><ellipse fill="#ee4f86" cx="18" cy="19" rx="10" ry="12"/><path fill="#62a94d" d="M12 9 8 5l1 7M19 7l2-5 2 6M25 11l5-3-3 7M10 18l-5-2 4 6M26 20l5 2-6 3"/><ellipse fill="#fffaf0" cx="18" cy="20" rx="6" ry="8"/><g fill="#342c2a" stroke="none"><circle cx="16" cy="16" r=".7"/><circle cx="20" cy="18" r=".7"/><circle cx="15" cy="22" r=".7"/><circle cx="21" cy="24" r=".7"/></g></g>`,
  'passion fruit': () => roundFruit('#76509d', '#f2c743', '#362d29'),
  'star fruit': () => `<g ${stroke}><path fill="#f4c84b" d="m18 4 3.6 9 9.4.6-7.2 6.2 2.4 9.2-8.2-5-8.2 5 2.4-9.2L5 13.6l9.4-.6L18 4Z"/><path fill="#fff3a2" d="m18 10 1.8 5.4 5.7.1-4.5 3.4 1.7 5.5-4.7-3.2-4.7 3.2 1.7-5.5-4.5-3.4 5.7-.1L18 10Z"/></g>`,
  grapefruit: () => roundFruit('#f5d34f', '#ed7f91'),
  cranberry: () => berry('#c92f45'),
  date: () => cluster('#8f5b39', '#6d963e'),
  persimmon: () => `<g ${stroke}><path fill="#f28a32" d="M7 19c0-7 4-11 11-11s11 4 11 11-5 11-11 11S7 26 7 19Z"/><path fill="#4f9346" d="m18 10-5-6 1 6-6-2 5 6h10l5-6-6 2 1-6-5 6Z"/></g>`,
  quince: () => `<g ${stroke}><path fill="#e8c84e" d="M19 8c7 1 10 7 8 14-2 7-8 10-14 8-6-2-8-9-5-15 2-5 6-8 11-7Z"/><path d="m18 9 2-5"/><path fill="#609b45" d="M20 6c3-3 7-2 8 1-3 2-6 2-8-1Z"/></g>`,
  jackfruit: () => ovalFruit('#84aa48', '#f2c54b', '#9a6a2f'),
  durian: () => `<g ${stroke}><path fill="#a9b84d" d="m18 3 3 5 5-3v6l6-1-3 6 4 3-5 3 2 6-6-1-2 6-4-5-4 5-2-6-6 1 2-6-5-3 4-3-3-6 6 1V5l5 3 3-5 4 5 4-5Z"/><ellipse fill="#f5d66b" cx="18" cy="19" rx="7" ry="9"/></g>`,
  rambutan: () => `<g ${stroke}><circle fill="#d94354" cx="18" cy="19" r="9"/>${[[18,6,18,2],[10,9,7,5],[26,9,30,6],[8,17,3,16],[28,17,33,15],[9,25,5,29],[27,25,31,29],[18,29,18,34]].map(p => `<path d="M${p[0]} ${p[1]}Q${p[2]} ${p[3]} ${p[2]} ${p[3]}"/>`).join('')}<circle fill="#fff7df" cx="18" cy="19" r="4"/></g>`,
  longan: () => cluster('#bd8d54'),
  gooseberry: () => `<g ${stroke}><circle fill="#9fbd4e" cx="18" cy="19" r="11"/><path d="M12 11c3 5 3 11 1 16M18 8v22M24 11c-3 5-3 11-1 16"/><path fill="#609b45" d="M17 9c0-5 4-7 8-6-1 4-4 7-8 6Z"/></g>`,
  currant: () => berry('#b6283e'),
  mulberry: () => cluster('#63345f'),
  boysenberry: () => berry('#542744'),
  breadfruit: () => `<g ${stroke}><circle fill="#7fac52" cx="18" cy="19" r="12"/><path fill="#5b9845" d="M17 8c0-5 4-7 8-6-1 4-4 7-8 6Z"/><g fill="none" stroke-width="1">${[10,15,20,25].map(x => `<path d="M${x} 11v16"/>`).join('')}<path d="M8 15h20M7 21h22"/></g></g>`,
  soursop: () => `<g ${stroke}><ellipse fill="#76ad52" cx="18" cy="19" rx="10" ry="13"/><path fill="#5b9845" d="M17 7c0-4 4-6 7-5-1 4-4 6-7 5Z"/>${[[10,12],[15,9],[22,10],[26,15],[9,20],[27,22],[13,28],[22,29]].map(([x,y]) => `<path d="m${x} ${y}-2-2"/>`).join('')}</g>`,
  plantain: () => `<g ${stroke}><path fill="#e7bc3e" d="M9 7c-2 12 2 20 12 23 3 1 6-1 7-4C17 25 12 18 13 7H9Z"/><path fill="#78a947" d="M14 7h-6V3h7l-1 4Z"/><path d="M12 9c1 9 5 14 12 17"/></g>`,
  yogurt: () => `<g ${stroke}><path fill="#f7f4e9" d="M8 10h20l-3 20H11L8 10Z"/><path fill="#7ec6d8" d="M7 7h22v5H7z"/><path fill="#e85b69" d="M18 16c4-5 9 0 5 5l-5 5-5-5c-4-5 1-10 5-5Z"/></g>`,
  peas: () => `<g ${stroke}><path fill="#75ae4d" d="M5 22C10 8 24 6 31 13c-5 14-19 18-26 9Z"/><circle fill="#b6d966" cx="12" cy="19" r="3"/><circle fill="#b6d966" cx="19" cy="16" r="3"/><circle fill="#b6d966" cx="26" cy="14" r="3"/></g>`,
  beef: () => `<g ${stroke}><path fill="#c94d55" d="M5 18C8 8 20 5 28 11c7 6 1 17-8 19C10 32 2 27 5 18Z"/><path fill="#f6d5c8" d="M13 17c3-5 9-5 12-1 2 4-2 8-7 8-5 0-8-3-5-7Z"/><path d="M7 23c5-1 8 1 11 6"/></g>`,
  pork: () => `<g ${stroke}><path fill="#ee9294" d="M6 19C8 9 20 5 28 11c6 6 1 16-8 19C10 32 4 27 6 19Z"/><path fill="#fff0df" d="M10 15c5-4 12-4 16 1"/><circle fill="#d86470" cx="18" cy="21" r="4"/></g>`,
  sausage: () => `<g ${stroke}><path fill="#c96a4b" d="M7 23c-4-4-2-10 2-13 4-3 8 0 6 4l-4 7c-1 2-2 3-4 2Zm22-10c4 4 2 10-2 13-4 3-8 0-6-4l4-7c1-2 2-3 4-2Z"/><path d="m7 10 2 2m18 12 2 2"/></g>`,
  meatball: () => `<g ${stroke}><path fill="#f1c15b" d="M5 19h26c-1 9-6 13-13 13S6 28 5 19Z"/><circle fill="#9f593d" cx="12" cy="17" r="5"/><circle fill="#9f593d" cx="21" cy="15" r="5"/><circle fill="#9f593d" cx="25" cy="20" r="4"/><path fill="#6da04b" d="m11 12 3-3m9 2 2-3"/></g>`,
  muffin: () => `<g ${stroke}><path fill="#e2a14d" d="M10 17h16l-2 14H12l-2-14Z"/><path fill="#d27c43" d="M8 16c0-6 4-10 10-10 4-4 10 0 10 6 0 4-3 7-7 7H11c-2 0-3-1-3-3Z"/><circle fill="#714733" stroke="none" cx="15" cy="11" r="1"/><circle fill="#714733" stroke="none" cx="22" cy="13" r="1"/></g>`,
  donut: () => `<g ${stroke}><circle fill="#d99b55" cx="18" cy="19" r="12"/><circle fill="#f07f9b" cx="18" cy="17" r="10"/><path fill="#d99b55" d="M14 18a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/><path stroke="#fff3a5" d="m10 13 3 1m10-3-2 3m4 6 3 1m-16 3-2 3"/></g>`,
  jam: () => `<g ${stroke}><path fill="#f4f0df" d="M9 10h18v21H9z"/><path fill="#b92e50" d="M10 17h16v13H10z"/><path fill="#72a64c" d="M17 19c0-4 4-6 7-5-1 4-4 6-7 5Z"/><circle fill="#dd4c68" cx="17" cy="23" r="4"/><path fill="#d7aa55" d="M8 6h20v6H8z"/></g>`
};

const preferredIcons = {
  sheep: 'ewe', hen: 'chicken', bee: 'honeybee', squirrel: 'chipmunk', orange: 'tangerine',
  grape: 'grapes', pomegranate: 'pomegranate', lime: 'lime', noodles: 'steaming-bowl',
  soup: 'pot-of-food', pasta: 'spaghetti', pumpkin: 'jack-o-lantern', candy: 'candy',
  cracker: 'rice-cracker', chocolate: 'chocolate-bar', honey: 'honey-pot'
};

function codePointKey(value) {
  return [...value]
    .map((character) => character.codePointAt(0).toString(16))
    .filter((code) => code !== 'fe0f')
    .join('-');
}

function iconBody(entry) {
  if (custom[entry.word]) {
    return `<g transform="scale(2)">${custom[entry.word]()}</g>`;
  }

  const directName = preferredIcons[entry.word] ?? entry.word.replaceAll(' ', '-');
  const directIcon = iconSet.icons[directName];
  if (directIcon) {
    return directIcon.body;
  }

  const mappedName = charMap[codePointKey(entry.sourceIcon)];
  const mappedIcon = iconSet.icons[mappedName];
  if (!mappedIcon) {
    throw new Error(`No illustration source for ${entry.theme}/${entry.word}.`);
  }

  return mappedIcon.body;
}

fs.mkdirSync(outputRoot, { recursive: true });

for (const entry of entries) {
  const directory = path.join(outputRoot, entry.theme);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${entry.word.replaceAll(' ', '-')}.svg`),
    wrap(iconBody(entry), `${entry.word} / ${entry.zh}`)
  );
}

for (const [theme, iconName] of Object.entries({ animals: 'paw-prints', fruits: 'strawberry', food: 'bread' })) {
  const icon = iconSet.icons[iconName];
  if (!icon) throw new Error(`Missing theme icon ${iconName}.`);
  const directory = path.join(outputRoot, 'themes');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${theme}.svg`), wrap(icon.body, theme));
}

const illustrationPaths = [
  ...entries.map((entry) => `./illustrations/${entry.theme}/${entry.word.replaceAll(' ', '-')}.svg`),
  './illustrations/themes/animals.svg',
  './illustrations/themes/fruits.svg',
  './illustrations/themes/food.svg'
];
fs.writeFileSync(
  path.join(outputRoot, 'manifest.json'),
  `${JSON.stringify(illustrationPaths, null, 2)}\n`
);

console.log(`Generated ${entries.length + 3} local SVG illustrations.`);
