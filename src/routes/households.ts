import { Router } from "express";
import { z } from "zod";
import { asyncHandler, httpError, userId } from "../middleware";
import {
  createHousehold,
  getHousehold,
  listHouseholds,
  updateHousehold,
} from "../repositories/households";

const router = Router();

const DIETS = ["Veg", "Non-veg", "Vegan", "Jain", "Satvik"] as const;
const GOALS = [
  "Balanced",
  "Weight loss",
  "Muscle gain",
  "Diabetic-friendly",
  "Kids nutrition",
] as const;

const householdSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  adults: z.number().int().min(1).max(20).optional(),
  kids: z.number().int().min(0).max(20).optional(),
  diet: z.enum(DIETS).optional(),
  region: z.string().min(1).max(60).optional(),
  maxCookMin: z.number().int().min(5).max(240).optional(),
  goal: z.enum(GOALS).optional(),
  dailyBudgetInr: z.number().int().min(0).max(100000).optional(),
  allergies: z.array(z.string().max(40)).max(20).optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw httpError(400, "Invalid request body", result.error.flatten());
  }
  return result.data;
}

// GET /api/households  -> households belonging to the signed-in user
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listHouseholds(userId(req)));
  })
);

// POST /api/households
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parse(householdSchema, req.body);
    const household = await createHousehold({ ...input, userId: userId(req) });
    res.status(201).json(household);
  })
);

// GET /api/households/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const household = await getHousehold(req.params.id);
    if (!household) throw httpError(404, "Household not found");
    if (household.userId && household.userId !== userId(req))
      throw httpError(404, "Household not found");
    res.json(household);
  })
);

// PATCH /api/households/:id
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getHousehold(req.params.id);
    if (!existing) throw httpError(404, "Household not found");
    if (existing.userId && existing.userId !== userId(req))
      throw httpError(404, "Household not found");
    const input = parse(householdSchema, req.body);
    const household = await updateHousehold(req.params.id, input);
    res.json(household);
  })
);

export default router;
