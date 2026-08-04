import { env } from "../config/env";
import { getHousehold } from "../repositories/households";
import { getFullPlan } from "../repositories/mealPlans";
import { getGrocery } from "../repositories/grocery";
import { listPantry } from "../repositories/pantry";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

async function callClaude(system: string, messages: ChatMsg[], maxTokens = 500): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return (data.content || [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n")
    .trim();
}

async function buildContext(householdId?: string, planId?: string): Promise<string> {
  const parts: string[] = [];
  try {
    if (householdId) {
      const h = await getHousehold(householdId);
      if (h) {
        parts.push(
          `Household: ${h.adults} adult(s), ${h.kids} kid(s); diet ${h.diet}; ${h.region} cuisine; ` +
            `goal ${h.goal}; daily budget Rs ${h.dailyBudgetInr}; ` +
            `allergies: ${h.allergies.length ? h.allergies.join(", ") : "none"}.`
        );
      }
    }
    if (planId) {
      const p = await getFullPlan(planId);
      if (p) {
        parts.push(`Current ${p.span} plan; protein target about ${p.proteinTargetG}g/day.`);
        const days = p.days
          .slice(0, 7)
          .map((d) => `${d.label}: ${d.meals.map((m) => `${m.mealType}=${m.dish}`).join(", ")}`);
        parts.push(`Planned meals -> ${days.join(" | ")}`);
        const g = await getGrocery(planId);
        if (g) parts.push(`Latest grocery list total Rs ${g.totalInr}.`);
      }
    }
    if (householdId) {
      const pantry = await listPantry(householdId);
      if (pantry.length) parts.push(`Pantry stock: ${pantry.map((x) => x.item).join(", ")}.`);
    }
  } catch {
    /* context is best-effort; ignore lookup failures */
  }
  return parts.join("\n");
}

const SYSTEM_BASE =
  'You are "Rasoi Assistant", a warm, practical kitchen helper for an Indian household using the Deemona Rasoi app. ' +
  "You help with four things: deciding what to cook and meal planning; choosing and substituting ingredients; " +
  "managing the grocery budget and expenses; and step-by-step cooking guidance. " +
  "Your replies are read ALOUD, so keep them short and conversational: 2 to 4 sentences, plain text, no markdown, " +
  "and no long numbered recipes (for a full recipe, tell them to tap 'View recipe' on the dish). " +
  "Use rupees for money. Use the household's context to be specific. " +
  "If asked something unrelated to food, cooking, groceries, or the household kitchen, gently steer back.";

export async function askAssistant(
  message: string,
  history: ChatMsg[],
  householdId?: string,
  planId?: string,
  language = "English"
): Promise<string> {
  const context = await buildContext(householdId, planId);
  let system = context ? `${SYSTEM_BASE}\n\nHousehold context:\n${context}` : SYSTEM_BASE;
  if (language && language.toLowerCase() !== "english") {
    system += `\n\nReply ONLY in ${language}, in a natural conversational tone.`;
  }

  const clean = (history || []).filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );
  while (clean.length && clean[0].role === "assistant") clean.shift();
  const messages: ChatMsg[] = [...clean.slice(-6), { role: "user", content: message }];

  return callClaude(system, messages, 500);
}
