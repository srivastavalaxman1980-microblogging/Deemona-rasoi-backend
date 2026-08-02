import { env } from "../config/env";
import {
  DayDraft,
  GroceryDraft,
  GroceryItemDraft,
  HouseholdConstraints,
  MealDraft,
  MEAL_TYPES,
  MealType,
} from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Short keys are used on the wire to Claude to keep responses compact; we map
// them to clean domain objects immediately after parsing.
const KEY_BY_MEAL: Record<MealType, string> = {
  breakfast: "b",
  lunch: "l",
  snack: "s",
  dinner: "din",
};

function toInt(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** Balance any unclosed [ or { in a JSON fragment (ignoring string contents). */
function closeBalance(fragment: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of fragment) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) suffix += stack[i] === "{" ? "}" : "]";
  return fragment + suffix;
}

/**
 * Pull the first JSON object out of a model response, tolerating code fences and
 * truncation. If the model runs out of tokens mid-array, trim to the last
 * complete object and close the brackets so a partial plan is still usable.
 */
function extractJSON(text: string): any {
  const cleaned = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("AI response did not contain JSON");

  const end = cleaned.lastIndexOf("}");
  if (end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* fall through to salvage */
    }
  }

  // Salvage a truncated response: cut to the last complete object, drop any
  // trailing comma, then balance the open brackets.
  let body = cleaned.slice(start);
  const lastObj = body.lastIndexOf("}");
  if (lastObj !== -1) body = body.slice(0, lastObj + 1);
  body = body.replace(/[\s,]+$/, "");
  return JSON.parse(closeBalance(body));
}

async function callClaude(system: string, user: string, maxTokens = 1600): Promise<any> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server");
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const text = (data.content || [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
  return extractJSON(text);
}

export function constraintsToText(c: HouseholdConstraints): string {
  const parts = [
    `${c.adults} adult(s) and ${c.kids} kid(s)`,
    `${c.diet} diet`,
    `${c.region} home cooking`,
    `max ${c.maxCookMin} min per meal`,
    `goal: ${c.goal}`,
    `daily food budget approx Rs ${c.dailyBudgetInr}`,
    c.occasion && c.occasion !== "Regular week" ? `context: ${c.occasion}` : "",
    c.allergies.length ? `avoid allergens: ${c.allergies.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function mapMeal(mealType: MealType, raw: any): MealDraft {
  return {
    mealType,
    dish: String(raw?.n ?? "").trim() || "Chef's choice",
    proteinG: toInt(raw?.p),
    kcal: toInt(raw?.k),
    cookMin: toInt(raw?.t),
    isVeg: Number(raw?.v) === 1,
  };
}

const WEEK_SYSTEM =
  "You plan meals for Indian families. Return ONLY minified JSON, no prose, no markdown. " +
  'Schema: {"w":[{"d":"Mon","b":M,"l":M,"s":M,"din":M}, ...7 days Mon..Sun]} ' +
  'where M={"n":dish name (<=4 words),"p":protein grams int,"k":kcal per person int,"t":cook mins int,"v":1 if vegetarian else 0}. ' +
  "Rules: authentic home-style dishes for the stated region; NO dish repeats within the week (except plain rice/roti); " +
  "no heavy or fried items for breakfast; balance heavy and light meals across the day; snacks are light; " +
  "respect diet strictly (Jain = no onion/garlic/root vegetables, Satvik and Vegan accordingly); " +
  "honour the family context and every listed allergen.";

/**
 * Generate one 7-day week. `avoidDishes` lets the month stitcher prevent
 * repeats across week boundaries.
 */
export async function generateWeek(
  c: HouseholdConstraints,
  avoidDishes: string[] = []
): Promise<DayDraft[]> {
  const avoidClause = avoidDishes.length
    ? ` Do NOT use any of these dishes (already planned): ${avoidDishes.join(", ")}.`
    : "";
  const user =
    "Plan a 7-day (Mon-Sun) meal calendar for: " +
    constraintsToText(c) +
    "." +
    avoidClause +
    " Minified JSON only.";

  const out = await callClaude(WEEK_SYSTEM, user, 4000);
  const week = out?.w;
  if (!Array.isArray(week) || week.length === 0) {
    throw new Error("Meal engine returned a malformed week");
  }

  return week.slice(0, 7).map((day: any, index: number): DayDraft => ({
    dayIndex: index,
    label: String(day?.d ?? DAY_LABELS[index] ?? `Day ${index + 1}`),
    meals: MEAL_TYPES.map((mt) => mapMeal(mt, day?.[KEY_BY_MEAL[mt]] ?? {})),
  }));
}

/**
 * Generate a multi-week plan by stitching sequential weeks together, carrying
 * an accumulating avoid-list so cross-week no-repeat actually holds.
 */
export async function generatePlan(
  c: HouseholdConstraints,
  weeks: number
): Promise<DayDraft[]> {
  const totalWeeks = Math.max(1, Math.min(4, Math.round(weeks)));
  const days: DayDraft[] = [];
  const seen = new Set<string>();

  for (let w = 0; w < totalWeeks; w++) {
    const week = await generateWeek(c, Array.from(seen));
    week.forEach((day) => {
      const dayIndex = days.length;
      days.push({
        ...day,
        dayIndex,
        label: totalWeeks > 1 ? `W${w + 1} ${day.label}` : day.label,
      });
      day.meals.forEach((m) => {
        const key = m.dish.toLowerCase();
        if (!/^(plain )?(rice|roti|chapati|chawal)$/.test(key)) seen.add(m.dish);
      });
    });
  }

  return days;
}

const GROCERY_SYSTEM =
  "You are a grocery estimator for Indian kitchens. Return ONLY minified JSON, no markdown. " +
  'Schema: {"g":[{"i":item,"q":quantity with unit,"c":category,"r":INR cost int}],"t":total INR int}. ' +
  "Categories must be one of: Vegetables, Grains & Flour, Dairy & Eggs, Protein, Spices & Oil, Other. " +
  "Use realistic current Indian retail prices. Consolidate duplicate ingredients.";

export async function buildGrocery(
  dishes: string[],
  householdSize: number,
  ownedItems: string[] = []
): Promise<GroceryDraft> {
  const unique = Array.from(new Set(dishes.map((d) => d.trim()).filter(Boolean)));
  // Note: we intentionally do NOT ask the model to drop owned items. The full
  // list is generated, then the caller marks pantry matches as already-owned so
  // the subtraction is visible ("skipped: ...") and the total nets correctly.
  void ownedItems;
  const user =
    `Build one consolidated grocery list with INR costs for a household of ${householdSize} for these dishes: ` +
    unique.join(", ") +
    ". Minified JSON only.";

  const out = await callClaude(GROCERY_SYSTEM, user, 4000);
  const rows = out?.g;
  if (!Array.isArray(rows)) throw new Error("Meal engine returned no grocery items");

  const items: GroceryItemDraft[] = rows.map((r: any) => ({
    item: String(r?.i ?? "").trim() || "Item",
    quantity: String(r?.q ?? "").trim(),
    category: String(r?.c ?? "Other").trim() || "Other",
    costInr: toInt(r?.r),
  }));

  const totalInr =
    toInt(out?.t) || items.reduce((sum, it) => sum + it.costInr, 0);

  return { items, totalInr };
}

const SWAP_SYSTEM =
  "Suggest ONE replacement Indian dish. Return ONLY minified JSON: " +
  '{"n":name (<=4 words),"p":protein g int,"k":kcal int,"t":mins int,"v":1 or 0}. No markdown.';

export async function swapMeal(
  c: HouseholdConstraints,
  mealType: MealType,
  currentDish: string,
  avoidDishes: string[]
): Promise<MealDraft> {
  const user =
    `Replace the ${mealType} dish "${currentDish}" with a different one. ` +
    `Constraints: ${constraintsToText(c)}. ` +
    `Must NOT be any of: ${avoidDishes.join(", ")}. ` +
    `Keep it appropriate for ${mealType}. Minified JSON only.`;

  const raw = await callClaude(SWAP_SYSTEM, user, 300);
  if (!raw?.n) throw new Error("Meal engine could not suggest a replacement");
  return mapMeal(mealType, raw);
}
