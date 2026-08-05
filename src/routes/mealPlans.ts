import { Router } from "express";
import { z } from "zod";
import { asyncHandler, httpError } from "../middleware";
import { getHousehold } from "../repositories/households";
import {
  deletePlan,
  getFullPlan,
  getMealContext,
  listPlans,
  replaceMeal,
  savePlan,
} from "../repositories/mealPlans";
import { deleteGrocery, getGrocery } from "../repositories/grocery";
import { generatePlan, swapMeal } from "../services/mealEngine";
import { HouseholdConstraints, proteinTarget, Span } from "../types";

const router = Router();

const generateSchema = z.object({
  span: z.enum(["week", "month"]).default("week"),
  occasion: z.string().max(60).default("Regular week"),
  title: z.string().max(120).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function todayYMD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// POST /api/households/:householdId/meal-plans  -> generate + persist a plan
router.post(
  "/households/:householdId/meal-plans",
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw httpError(400, "Invalid request body", parsed.error.flatten());
    const { span, occasion } = parsed.data;
    const weekStart = parsed.data.startDate || todayYMD();

    const household = await getHousehold(req.params.householdId);
    if (!household) throw httpError(404, "Household not found");

    const constraints: HouseholdConstraints = {
      adults: household.adults,
      kids: household.kids,
      diet: household.diet,
      region: household.region,
      maxCookMin: household.maxCookMin,
      goal: household.goal,
      dailyBudgetInr: household.dailyBudgetInr,
      allergies: household.allergies,
      occasion,
    };

    const weeks = span === "month" ? 4 : 1;
    const days = await generatePlan(constraints, weeks);

    const planId = await savePlan(
      household.id,
      {
        title: parsed.data.title || (span === "month" ? "Monthly plan" : "Weekly plan"),
        span: span as Span,
        occasion,
        proteinTargetG: proteinTarget(household),
        constraints,
        weekStart,
      },
      days
    );

    const full = await getFullPlan(planId);
    res.status(201).json(full);
  })
);

// GET /api/households/:householdId/meal-plans  -> list summaries
router.get(
  "/households/:householdId/meal-plans",
  asyncHandler(async (req, res) => {
    const plans = await listPlans(req.params.householdId);
    res.json(plans);
  })
);

// GET /api/meal-plans/:id  -> full plan (+ grocery list if built)
router.get(
  "/meal-plans/:id",
  asyncHandler(async (req, res) => {
    const plan = await getFullPlan(req.params.id);
    if (!plan) throw httpError(404, "Meal plan not found");
    const grocery = await getGrocery(plan.id);
    res.json({ ...plan, grocery });
  })
);

// DELETE /api/meal-plans/:id
router.delete(
  "/meal-plans/:id",
  asyncHandler(async (req, res) => {
    const ok = await deletePlan(req.params.id);
    if (!ok) throw httpError(404, "Meal plan not found");
    res.status(204).send();
  })
);

// POST /api/meals/:mealId/swap  -> AI swaps one dish, invalidates grocery list
router.post(
  "/meals/:mealId/swap",
  asyncHandler(async (req, res) => {
    const ctx = await getMealContext(req.params.mealId);
    if (!ctx) throw httpError(404, "Meal not found");

    const replacement = await swapMeal(
      ctx.constraints,
      ctx.mealType,
      ctx.currentDish,
      ctx.otherDishes
    );
    await replaceMeal(ctx.mealId, replacement);
    await deleteGrocery(ctx.planId); // grocery list is now stale

    res.json({ mealId: ctx.mealId, ...replacement });
  })
);

export default router;
