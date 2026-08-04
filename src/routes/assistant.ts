import { Router } from "express";
import { z } from "zod";
import { asyncHandler, httpError } from "../middleware";
import { askAssistant } from "../services/assistantService";

const router = Router();

const schema = z.object({
  message: z.string().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
  householdId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
});

// POST /api/assistant  -> short, context-aware kitchen guidance
router.post(
  "/assistant",
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid request", parsed.error.flatten());
    const { message, history, householdId, planId } = parsed.data;
    const reply = await askAssistant(message, history || [], householdId, planId);
    res.json({ reply });
  })
);

export default router;
