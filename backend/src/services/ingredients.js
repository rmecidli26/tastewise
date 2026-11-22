/**
 * Helpers that turn what people type ("prawns", "nuts", "dairy") into
 * patterns matched against ingredient names in the database.
 */

// One word typed by the user → the ingredient names it should match
const GROUPS = {
  dairy: ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'mozzarella', 'yoghurt', 'kaymak', 'parmesan', 'burrata'],
  gluten: ['flour', 'bread', 'pasta', 'lavash', 'pizza dough'],
  meat: ['beef', 'lamb', 'chicken', 'meat', 'pepperoni'],
  fish: ['salmon', 'sturgeon', 'anchovy', 'tuna'],
  seafood: ['shrimp', 'salmon', 'sturgeon', 'anchovy', 'tuna'],
  nut: ['walnut', 'chestnut'],
  pork: ['pork', 'bacon', 'ham']
};

// Group words in Azerbaijani and Russian → the group above
const GROUP_ALIASES = {
  'süd məhsulları': 'dairy', 'süd məhsulu': 'dairy', 'laktoza': 'dairy',
  'молочное': 'dairy', 'молочные продукты': 'dairy', 'молочка': 'dairy', 'лактоза': 'dairy',
  'qlüten': 'gluten', 'глютен': 'gluten',
  'qoz-fındıq': 'nut', 'fındıq': 'nut', 'qozlar': 'nut', 'орехи': 'nut', 'орех': 'nut',
  'ət': 'meat', 'мясо': 'meat',
  'balıq': 'fish', 'рыба': 'fish',
  'dəniz məhsulları': 'seafood', 'морепродукты': 'seafood',
  'donuz': 'pork', 'donuz əti': 'pork', 'свинина': 'pork'
};

// Spellings / singular forms → the stored ingredient name (English key or its translation)
const SYNONYMS = {
  prawn: 'shrimp',
  yogurt: 'yoghurt',
  chili: 'chilli',
  chile: 'chilli',
  aubergine: 'eggplant',
  'креветка': 'креветки', 'яйцо': 'яйца', 'томат': 'помидоры', 'томаты': 'помидоры', 'огурцы': 'огурец',
  'каштаны': 'каштан', 'ягода': 'ягоды', 'гриб': 'грибы', 'kreveti': 'krevet', 'yumurtalar': 'yumurta'
};

/** "Tomatoes" → "tomato", "berries" → "berry", "eggs" → "egg". English only; other languages are left as typed. */
export function stem(word) {
  let w = String(word).toLowerCase().trim().replace(/\s+/g, ' ');
  if (!/^[a-z ]+$/.test(w)) return w;
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Splits "salmon, mushrooms; nuts" or an array into clean, unique terms (max 10). */
export function parseTerms(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,;\n]+/);
  return [...new Set(list.map(t => String(t).toLowerCase().trim()).filter(t => t.length >= 2 && t.length <= 40))].slice(0, 10);
}

/** A term → all base words it stands for. */
export function expandTerm(term) {
  const raw = String(term).toLowerCase().trim();
  const s = stem(raw);
  const group = GROUPS[s] || GROUPS[raw] || GROUPS[GROUP_ALIASES[raw]];
  if (group) return group;
  return [SYNONYMS[s] || SYNONYMS[raw] || s];
}

const escapeLike = s => s.replace(/[\\%_]/g, c => `\\${c}`);
export const toLikePattern = word => `%${escapeLike(word)}%`;

/** For "avoid" filters: every word of every term becomes a pattern (any match excludes the dish). */
export const excludePatterns = terms => [...new Set(parseTerms(terms).flatMap(expandTerm).map(toLikePattern))];

/** For "must contain" filters: one pattern per term (groups are not expanded). */
export const includePatterns = terms => [...new Set(parseTerms(terms).map(t => toLikePattern(SYNONYMS[stem(t)] || SYNONYMS[t] || stem(t))))];

/** Does a dish contain this term? names = ingredient names in every language (lowercase). Used for soft scoring. */
export function dishHasTerm(ingredientNames, term) {
  const words = expandTerm(term);
  return ingredientNames.some(name => words.some(w => name.includes(w)));
}
