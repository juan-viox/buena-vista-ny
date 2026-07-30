import * as React from 'react';
import { getRepository, getLiveMenus } from '@viox/db';
import type { Recipe } from '@viox/db';
import { MenuManager, type RecipeMatch } from './MenuManager';

export const metadata = {
  title: 'Menus — VioX AI OS',
};

// ============================================================
// /menus — Popmenu-parity menu manager. The OS holds the live
// menu fixture (536 real scraped items) and the marketing site
// publishes from it. Recipes from the costing module are fuzzy-
// matched onto menu items so priced dishes carry margin chips.
// ============================================================

export default async function MenusPage() {
  const repo = getRepository();
  const [recipes, locations] = await Promise.all([repo.getRecipes(), Promise.resolve(getLiveMenus())]);

  const recipeBySlug = buildRecipeMatches(recipes);

  return <MenuManager locations={locations} recipeBySlug={recipeBySlug} />;
}

// ---------- recipe ↔ menu-item fuzzy matching ----------

const STOP_WORDS = new Set([
  'de', 'la', 'a', 'con', 'el', 'al', 'y', 'the', 'bv', 'glass',
  'lunch', 'brunch', 'dinner', 'ln', 'for', 'two',
]);

/** Lowercase, strip diacritics, drop punctuation + filler words. */
function tokens(name: string): string[] {
  const flat = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return flat.split(' ').filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

/**
 * A menu item matches a recipe when the significant tokens of one
 * name are a subset of the other's ("Ceviche Limeno Lunch" ⊇
 * "Ceviche Limeño"; "Flan" ⊆ "Flan de Caramelo"). Single-token
 * item names only match on the recipe's lead token, so "Side Salad"
 * never claims "Green Avocado Salad".
 */
function namesMatch(recipeTokens: string[], itemName: string): boolean {
  const it = tokens(itemName);
  if (recipeTokens.length === 0 || it.length === 0) return false;
  const rSet = new Set(recipeTokens);
  const iSet = new Set(it);
  if (recipeTokens.every((t) => iSet.has(t))) return true; // recipe ⊆ item
  if (it.length === 1) return it[0] === recipeTokens[0];
  return it.every((t) => rSet.has(t)); // item ⊆ recipe
}

function buildRecipeMatches(recipes: Recipe[]): Record<string, RecipeMatch> {
  const prepared = recipes.map((r) => ({ recipe: r, toks: tokens(r.menuItemName) }));
  const bySlug: Record<string, RecipeMatch> = {};
  const seenNames = new Map<string, RecipeMatch>();

  for (const item of getLiveMenus().flatMap((l) => l.menus.flatMap((m) => m.sections.flatMap((s) => s.items)))) {
    const key = `${item.loc}:${item.slug}`;
    if (bySlug[key]) continue;
    const cached = seenNames.get(item.name);
    if (cached) {
      bySlug[key] = cached;
      continue;
    }
    const hit = prepared.find((p) => namesMatch(p.toks, item.name));
    if (!hit) continue;
    const match: RecipeMatch = {
      recipeId: hit.recipe.id,
      recipeName: hit.recipe.menuItemName,
      plateCost: hit.recipe.plateCost,
      recipePrice: hit.recipe.menuPrice,
      targetCostPct: hit.recipe.targetCostPct,
    };
    seenNames.set(item.name, match);
    bySlug[key] = match;
  }
  return bySlug;
}
