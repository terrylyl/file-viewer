export type ThemeId = 'animals' | 'fruits' | 'food';
export type LevelNumber = 1 | 2 | 3 | 4 | 5;

export const LEVEL_NUMBERS = [1, 2, 3, 4, 5] as const satisfies readonly LevelNumber[];

export type WordEntry = {
  id: string;
  word: string;
  zh: string;
  sentence: string;
  theme: ThemeId;
  level: LevelNumber;
  image: string;
};

export type Theme = {
  id: ThemeId;
  title: string;
  image: string;
  color: string;
  words: WordEntry[];
};

export type ThemeSummary = {
  id: ThemeId;
  title: string;
  image: string;
  color: string;
  wordCount: number;
  levelCount: number;
};

type WordSeed = [word: string, zh: string, level: LevelNumber, sourceIcon: string];

const words = {
  animals: [
    ['cat', '猫', 1, '🐱'],
    ['dog', '狗', 1, '🐶'],
    ['bird', '鸟', 1, '🐦'],
    ['fish', '鱼', 1, '🐟'],
    ['rabbit', '兔子', 1, '🐰'],
    ['duck', '鸭子', 1, '🦆'],
    ['cow', '奶牛', 1, '🐮'],
    ['pig', '猪', 1, '🐷'],
    ['horse', '马', 1, '🐴'],
    ['sheep', '绵羊', 1, '🐑'],
    ['lion', '狮子', 2, '🦁'],
    ['tiger', '老虎', 2, '🐯'],
    ['elephant', '大象', 2, '🐘'],
    ['monkey', '猴子', 2, '🐵'],
    ['bear', '熊', 2, '🐻'],
    ['panda', '熊猫', 2, '🐼'],
    ['giraffe', '长颈鹿', 2, '🦒'],
    ['zebra', '斑马', 2, '🦓'],
    ['kangaroo', '袋鼠', 2, '🦘'],
    ['koala', '考拉', 2, '🐨'],
    ['mouse', '老鼠', 3, '🐭'],
    ['frog', '青蛙', 3, '🐸'],
    ['turtle', '乌龟', 3, '🐢'],
    ['snake', '蛇', 3, '🐍'],
    ['fox', '狐狸', 3, '🦊'],
    ['wolf', '狼', 3, '🐺'],
    ['deer', '鹿', 3, '🦌'],
    ['goat', '山羊', 3, '🐐'],
    ['hen', '母鸡', 3, '🐔'],
    ['rooster', '公鸡', 3, '🐓'],
    ['bee', '蜜蜂', 4, '🐝'],
    ['butterfly', '蝴蝶', 4, '🦋'],
    ['ant', '蚂蚁', 4, '🐜'],
    ['spider', '蜘蛛', 4, '🕷️'],
    ['whale', '鲸鱼', 4, '🐳'],
    ['dolphin', '海豚', 4, '🐬'],
    ['shark', '鲨鱼', 4, '🦈'],
    ['penguin', '企鹅', 4, '🐧'],
    ['seal', '海豹', 4, '🦭'],
    ['octopus', '章鱼', 4, '🐙'],
    ['owl', '猫头鹰', 5, '🦉'],
    ['eagle', '鹰', 5, '🦅'],
    ['parrot', '鹦鹉', 5, '🦜'],
    ['peacock', '孔雀', 5, '🦚'],
    ['camel', '骆驼', 5, '🐫'],
    ['donkey', '驴', 5, '🫏'],
    ['squirrel', '松鼠', 5, '🐿️'],
    ['hedgehog', '刺猬', 5, '🦔'],
    ['hippo', '河马', 5, '🦛'],
    ['rhino', '犀牛', 5, '🦏']
  ],
  fruits: [
    ['apple', '苹果', 1, '🍎'],
    ['banana', '香蕉', 1, '🍌'],
    ['orange', '橙子', 1, '🍊'],
    ['grape', '葡萄', 1, '🍇'],
    ['strawberry', '草莓', 1, '🍓'],
    ['watermelon', '西瓜', 1, '🍉'],
    ['pear', '梨', 1, '🍐'],
    ['peach', '桃子', 1, '🍑'],
    ['mango', '芒果', 1, '🥭'],
    ['pineapple', '菠萝', 1, '🍍'],
    ['lemon', '柠檬', 2, '🍋'],
    ['cherry', '樱桃', 2, '🍒'],
    ['blueberry', '蓝莓', 2, '🫐'],
    ['raspberry', '树莓', 2, '🍓'],
    ['blackberry', '黑莓', 2, '🫐'],
    ['kiwi', '猕猴桃', 2, '🥝'],
    ['melon', '甜瓜', 2, '🍈'],
    ['coconut', '椰子', 2, '🥥'],
    ['papaya', '木瓜', 2, '🟧'],
    ['plum', '李子', 2, '🟣'],
    ['apricot', '杏子', 3, '🟠'],
    ['fig', '无花果', 3, '🟤'],
    ['guava', '番石榴', 3, '🟢'],
    ['lychee', '荔枝', 3, '🔴'],
    ['pomegranate', '石榴', 3, '🔴'],
    ['dragon fruit', '火龙果', 3, '🐉'],
    ['passion fruit', '百香果', 3, '🟣'],
    ['star fruit', '杨桃', 3, '⭐'],
    ['grapefruit', '西柚', 3, '🍊'],
    ['lime', '青柠', 3, '🟢'],
    ['tangerine', '橘子', 4, '🍊'],
    ['mandarin', '柑橘', 4, '🍊'],
    ['nectarine', '油桃', 4, '🍑'],
    ['cantaloupe', '哈密瓜', 4, '🍈'],
    ['honeydew', '蜜瓜', 4, '🍈'],
    ['cranberry', '蔓越莓', 4, '🔴'],
    ['date', '椰枣', 4, '🟤'],
    ['persimmon', '柿子', 4, '🟠'],
    ['quince', '榅桲', 4, '🟡'],
    ['jackfruit', '菠萝蜜', 4, '🟡'],
    ['durian', '榴莲', 5, '🟤'],
    ['rambutan', '红毛丹', 5, '🔴'],
    ['longan', '龙眼', 5, '🟤'],
    ['gooseberry', '醋栗', 5, '🟢'],
    ['currant', '加仑子', 5, '🔴'],
    ['mulberry', '桑葚', 5, '🟣'],
    ['boysenberry', '波森莓', 5, '🟣'],
    ['breadfruit', '面包果', 5, '🟢'],
    ['soursop', '刺果番荔枝', 5, '🟢'],
    ['plantain', '大蕉', 5, '🍌']
  ],
  food: [
    ['milk', '牛奶', 1, '🥛'],
    ['bread', '面包', 1, '🍞'],
    ['egg', '鸡蛋', 1, '🥚'],
    ['rice', '米饭', 1, '🍚'],
    ['cake', '蛋糕', 1, '🍰'],
    ['cookie', '饼干', 1, '🍪'],
    ['cheese', '奶酪', 1, '🧀'],
    ['noodles', '面条', 1, '🍜'],
    ['chicken', '鸡肉', 1, '🍗'],
    ['soup', '汤', 1, '🍲'],
    ['pizza', '披萨', 2, '🍕'],
    ['pasta', '意面', 2, '🍝'],
    ['sandwich', '三明治', 2, '🥪'],
    ['hamburger', '汉堡', 2, '🍔'],
    ['hot dog', '热狗', 2, '🌭'],
    ['fries', '薯条', 2, '🍟'],
    ['pancake', '煎饼', 2, '🥞'],
    ['waffle', '华夫饼', 2, '🧇'],
    ['cereal', '麦片', 2, '🥣'],
    ['yogurt', '酸奶', 2, '🥛'],
    ['salad', '沙拉', 3, '🥗'],
    ['carrot', '胡萝卜', 3, '🥕'],
    ['potato', '土豆', 3, '🥔'],
    ['tomato', '番茄', 3, '🍅'],
    ['corn', '玉米', 3, '🌽'],
    ['peas', '豌豆', 3, '🟢'],
    ['beans', '豆子', 3, '🫘'],
    ['broccoli', '西兰花', 3, '🥦'],
    ['cucumber', '黄瓜', 3, '🥒'],
    ['pumpkin', '南瓜', 3, '🎃'],
    ['fish', '鱼肉', 4, '🐟'],
    ['beef', '牛肉', 4, '🥩'],
    ['pork', '猪肉', 4, '🥩'],
    ['sausage', '香肠', 4, '🌭'],
    ['bacon', '培根', 4, '🥓'],
    ['meatball', '肉丸', 4, '🧆'],
    ['dumpling', '饺子', 4, '🥟'],
    ['sushi', '寿司', 4, '🍣'],
    ['taco', '塔可', 4, '🌮'],
    ['burrito', '墨西哥卷饼', 4, '🌯'],
    ['ice cream', '冰淇淋', 5, '🍦'],
    ['chocolate', '巧克力', 5, '🍫'],
    ['candy', '糖果', 5, '🍬'],
    ['popcorn', '爆米花', 5, '🍿'],
    ['cracker', '薄脆饼干', 5, '🍘'],
    ['muffin', '松饼', 5, '🧁'],
    ['donut', '甜甜圈', 5, '🍩'],
    ['pie', '派', 5, '🥧'],
    ['jam', '果酱', 5, '🍓'],
    ['honey', '蜂蜜', 5, '🍯']
  ]
} satisfies Record<ThemeId, WordSeed[]>;

const uncountableFood = new Set([
  'milk',
  'bread',
  'rice',
  'cheese',
  'chicken',
  'soup',
  'pasta',
  'cereal',
  'yogurt',
  'salad',
  'corn',
  'fish',
  'beef',
  'pork',
  'bacon',
  'sushi',
  'ice cream',
  'chocolate',
  'candy',
  'popcorn',
  'jam',
  'honey'
]);

const pluralFood = new Set(['noodles', 'fries', 'peas', 'beans']);

function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

function makeSentence(theme: ThemeId, word: string): string {
  if (theme === 'food') {
    if (pluralFood.has(word)) {
      return `These are ${word}.`;
    }

    if (uncountableFood.has(word)) {
      return `This is ${word}.`;
    }
  }

  return `This is ${articleFor(word)} ${word}.`;
}

function slugify(word: string): string {
  return word.replace(/\s+/g, '-');
}

function makeWords(theme: ThemeId): WordEntry[] {
  return words[theme].map(([word, zh, level]) => ({
    id: `${theme}-${slugify(word)}`,
    word,
    zh,
    sentence: makeSentence(theme, word),
    theme,
    level,
    image: `./illustrations/${theme}/${slugify(word)}.svg`
  }));
}

export const themes: Theme[] = [
  {
    id: 'animals',
    title: 'Animals',
    image: './illustrations/themes/animals.svg',
    color: '#1f7a8c',
    words: makeWords('animals')
  },
  {
    id: 'fruits',
    title: 'Fruits',
    image: './illustrations/themes/fruits.svg',
    color: '#d95d39',
    words: makeWords('fruits')
  },
  {
    id: 'food',
    title: 'Food',
    image: './illustrations/themes/food.svg',
    color: '#6a994e',
    words: makeWords('food')
  }
];

export function getThemeSummaries(): ThemeSummary[] {
  return themes.map((theme) => ({
    id: theme.id,
    title: theme.title,
    image: theme.image,
    color: theme.color,
    wordCount: theme.words.length,
    levelCount: LEVEL_NUMBERS.length
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
