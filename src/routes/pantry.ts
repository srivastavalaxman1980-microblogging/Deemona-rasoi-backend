import { Router } from "express";
import { z } from "zod";
import { asyncHandler, httpError } from "../middleware";
import {
  addPantryItem,
  deletePantryItem,
  listPantry,
  updatePantryItem,
} from "../repositories/pantry";

const router = Router();

const itemSchema = z.object({
  item: z.string().min(1).max(80),
  quantity: z.string().max(40).optional(),
  category: z.string().max(40).optional(),
  expiryDate: z.string().max(20).nullable().optional(),
});

const patchSchema = itemSchema.partial();

// GET /api/households/:householdId/pantry
router.get(
  "/households/:householdId/pantry",
  asyncHandler(async (req, res) => {
    res.json(await listPantry(req.params.householdId));
  })
);

// POST /api/households/:householdId/pantry
router.post(
  "/households/:householdId/pantry",
  asyncHandler(async (req, res) => {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid pantry item", parsed.error.flatten());
    const created = await addPantryItem(req.params.householdId, parsed.data);
    res.status(201).json(created);
  })
);

// PATCH /api/pantry/:id
router.patch(
  "/pantry/:id",
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid pantry item", parsed.error.flatten());
    const updated = await updatePantryItem(req.params.id, parsed.data);
    if (!updated) throw httpError(404, "Pantry item not found");
    res.json(updated);
  })
);

// DELETE /api/pantry/:id
router.delete(
  "/pantry/:id",
  asyncHandler(async (req, res) => {
    const ok = await deletePantryItem(req.params.id);
    if (!ok) throw httpError(404, "Pantry item not found");
    res.status(204).send();
  })
);

export default router;
