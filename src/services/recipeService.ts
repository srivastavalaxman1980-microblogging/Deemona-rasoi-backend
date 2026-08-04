import { env } from "../config/env";
import { normalizeItem } from "../lib/match";
import { getRecipeCache, setRecipeCache } from "../repositories/media";
import { resolveImage } from "./imageService";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function extractJSON(text: string): any {
  const cleaned = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("Recipe engine did not return JSON");
  return JSON.parse(cleaned.slice(a, b + 1));
}

async function callClaude(system: string, user: string, maxTokens = 1600): Promise<any> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
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
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const text = (data.content || [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
  return extractJSON(text);
}

const RECIPE_SYSTEM_BASE =
  "You are a home-cooking assistant for Indian households, covering Indian and international cuisines. " +
  "Return ONLY minified JSON, no markdown. " +
  'Schema: {"desc":short description (1-2 sentences),"serv":servings int,' +
  '"ing":[{"n":ingredient name (2-3 words, generic, no brand),"en":the same ingredient name in English,"q":quantity with unit}],' +
  '"steps":[clear ordered step strings],"tips":[optional short tips]}. ' +
  "Write a genuine home-style recipe a beginner can follow, 6 to 12 concise steps, using common kitchen measures.";

function recipeSystem(language: string): string {
  if (language && language.toLowerCase() !== "english") {
    return (
      RECIPE_SYSTEM_BASE +
      ` Write "desc", each ingredient "n", all "steps", and "tips" in ${language}. ` +
      `Keep each ingredient's "en" field in plain English (used only for image lookup).`
    );
  }
  return RECIPE_SYSTEM_BASE + ' Set each ingredient "en" equal to "n".';
}

export interface RecipeIngredient {
  name: string;
  quantity: string;
  image: string | null;
}

export interface RecipeData {
  dishName: string;
  isVeg: boolean;
  cuisine: string;
  image: { url: string; creditName: string; creditUrl: string } | null;
  description: string;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tips: string[];
}

export async function getRecipeForDish(
  dishName: string,
  isVeg: boolean,
  cuisine: string,
  language = "English"
): Promise<RecipeData> {
  const baseKey = normalizeItem(dishName) || dishName.toLowerCase().trim();
  const key = `${baseKey}::${language.toLowerCase()}`;

  const cached = await getRecipeCache(key);
  if (cached) return cached as RecipeData;

  const user =
    `Recipe for the dish "${dishName}". It is ${isVeg ? "vegetarian" : "non-vegetarian"}. ` +
    `Cuisine style: ${cuisine}. Minified JSON only.`;
  const gen = await callClaude(recipeSystem(language), user, 1600);

  const rawIngredients: any[] = Array.isArray(gen.ing) ? gen.ing : [];

  const [dishImg, ingredients] = await Promise.all([
    resolveImage("dish", dishName),
    Promise.all(
      rawIngredients.map(async (ing) => {
        const name = String(ing?.n || "").trim();
        if (!name) return null;
        const englishName = String(ing?.en || ing?.n || "").trim() || name;
        const img = await resolveImage("ingredient", englishName);
        return { name, quantity: String(ing?.q || "").trim(), image: img?.url || null };
      })
    ).then((list) => list.filter((x): x is RecipeIngredient => x !== null)),
  ]);

  const data: RecipeData = {
    dishName,
    isVeg,
    cuisine,
    image: dishImg,
    description: String(gen.desc || "").trim(),
    servings: Number(gen.serv) || 4,
    ingredients,
    steps: Array.isArray(gen.steps) ? gen.steps.map((s: any) => String(s)) : [],
    tips: Array.isArray(gen.tips) ? gen.tips.map((s: any) => String(s)) : [],
  };

  await setRecipeCache(key, dishName, data);
  return data;
}
