import { Router } from "express";
import { asyncHandler, httpError } from "../middleware";
import { getMealDish } from "../repositories/mealPlans";
import { getRecipeForDish } from "../services/recipeService";
import { resolveImage } from "../services/imageService";

const router = Router();

// GET /api/meals/:mealId/recipe  -> full recipe (cached by dish name)
router.get(
  "/meals/:mealId/recipe",
  asyncHandler(async (req, res) => {
    const meal = await getMealDish(req.params.mealId);
    if (!meal) throw httpError(404, "Meal not found");
    const recipe = await getRecipeForDish(meal.dishName, meal.isVeg, meal.cuisine);
    res.json(recipe);
  })
);

// GET /api/dish-image?name=<dish>  -> { url, creditName, creditUrl } or { url: null }
router.get(
  "/dish-image",
  asyncHandler(async (req, res) => {
    const name = String(req.query.name || "").trim();
    if (!name) throw httpError(400, "name query parameter is required");
    const img = await resolveImage("dish", name);
    res.json(img || { url: null, creditName: "", creditUrl: "" });
  })
);

export default router;
