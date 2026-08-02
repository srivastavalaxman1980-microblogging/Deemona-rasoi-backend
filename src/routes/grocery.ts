import { Router } from "express";
import { asyncHandler, httpError } from "../middleware";
import { getFullPlan } from "../repositories/mealPlans";
import { getGrocery, saveGrocery } from "../repositories/grocery";
import { listPantry } from "../repositories/pantry";
import { buildGrocery } from "../services/mealEngine";
import { inPantry } from "../lib/match";

const router = Router();

// POST /api/meal-plans/:id/grocery  -> build (or rebuild) the grocery list,
// subtracting whatever the household already has in its pantry.
router.post(
  "/meal-plans/:id/grocery",
  asyncHandler(async (req, res) => {
    const plan = await getFullPlan(req.params.id);
    if (!plan) throw httpError(404, "Meal plan not found");

    const dishes = plan.days.flatMap((d) => d.meals.map((m) => m.dish)).filter(Boolean);
    if (dishes.length === 0) throw httpError(422, "This plan has no meals to shop for");

    const pantry = await listPantry(plan.householdId);
    const pantryNames = pantry.map((p) => p.item);

    const householdSize = plan.constraints.adults + plan.constraints.kids;
    const draft = await buildGrocery(dishes, householdSize, pantryNames);

    // Deterministic safety net: mark anything the model still listed that we
    // already own, and net the total to what actually needs buying.
    const items = draft.items.map((it) => ({
      ...it,
      isHave: pantryNames.length > 0 && inPantry(it.item, pantryNames),
    }));
    const totalInr = items
      .filter((it) => !it.isHave)
      .reduce((sum, it) => sum + it.costInr, 0);

    await saveGrocery(plan.id, { items, totalInr });

    const stored = await getGrocery(plan.id);
    res.status(201).json(stored);
  })
);

// GET /api/meal-plans/:id/grocery
router.get(
  "/meal-plans/:id/grocery",
  asyncHandler(async (req, res) => {
    const stored = await getGrocery(req.params.id);
    if (!stored) throw httpError(404, "No grocery list built for this plan yet");
    res.json(stored);
  })
);

export default router;
