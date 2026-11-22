import { searchDishes } from './dishes.js';
import { dishHasTerm, parseTerms } from './ingredients.js';

import { t } from '../i18n.js';

/**
 * Scores one dish against soft preferences (0–99). Pure function — easy to unit test and tune.
 * Hard filters (diet, avoid, budget, meal) are applied before this, in SQL.
 */
export function scoreDish(dish, prefs, lang = 'az') {
  let score = 50;
  const reasons = [];

  if (prefs.cuisine?.length) {
    if (prefs.cuisine.includes(dish.cuisine)) {
      score += 20;
      reasons.push(t(lang, `r.cuisine.${dish.cuisine}`));
    } else score -= 15;
  }

  if (prefs.mood) {
    if (dish.moodTags.includes(prefs.mood)) {
      score += 12;
      reasons.push(t(lang, `r.mood.${prefs.mood}`));
    } else score -= 5;
  }

  if (prefs.spice !== undefined && prefs.spice !== null) {
    const gap = Math.abs(dish.spiceLevel - prefs.spice);
    score += [10, 3, -8, -15][gap];
    if (gap === 0 && prefs.spice > 0) reasons.push(t(lang, `r.spice.${prefs.spice}`));
  }

  // dish.terms = ingredient names in every language, so 'qoz', 'орех' and 'walnut' all match
  const loved = parseTerms(prefs.love || []).filter(term => dishHasTerm(dish.terms || dish.ingredients, term));
  if (loved.length) {
    score += 12 * loved.length;
    reasons.push(t(lang, 'r.has', { list: loved.join(', ') }));
  }

  // Well-rated dishes get a small boost (max ±4)
  if (dish.rating.count >= 3 && dish.rating.average) score += Math.round((dish.rating.average - 3) * 2);

  if (prefs.diet?.length) reasons.push(prefs.diet.map(d => t(lang, `r.diet.${d}`)).join(', '));
  if (prefs.budget) reasons.push(t(lang, 'r.budget', { n: prefs.budget }));

  return { score: Math.max(5, Math.min(99, Math.round(score))), reasons };
}

/**
 * @param {object} prefs  meal, cuisine[], mood, diet[], spice (0–3), budget, love (terms), avoid (terms)
 * @returns {{ strongMatches: boolean, dishes: Array }}
 */
export async function recommend(prefs, lang = 'az') {
  const { dishes } = await searchDishes({
    meal: prefs.meal,
    diet: prefs.diet,
    maxPrice: prefs.budget,
    exclude: prefs.avoid,
    lang,
    limit: 200
  });

  const ranked = dishes
    .map(d => ({ ...d, ...scoreDish(d, prefs, lang) }))
    .sort((a, b) => b.score - a.score || a.price - b.price);

  const strong = ranked.filter(d => d.score >= 60);
  return strong.length >= 3
    ? { strongMatches: true, dishes: strong.slice(0, 9) }
    : { strongMatches: false, dishes: ranked.slice(0, 6) };
}
