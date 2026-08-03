import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { pool } from "./db/pool";
import { auth, errorHandler, notFound } from "./middleware";
import householdsRouter from "./routes/households";
import mealPlansRouter from "./routes/mealPlans";
import groceryRouter from "./routes/grocery";
import pantryRouter from "./routes/pantry";
import recipesRouter from "./routes/recipes";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Public health check (no auth) -- verifies process and DB connectivity.
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up", model: env.ANTHROPIC_MODEL });
  } catch (err: any) {
    res.status(503).json({ status: "degraded", db: "down", error: err.message });
  }
});

// Everything below requires an identity (see middleware/auth for the seam).
app.use("/api", auth);
app.use("/api/households", householdsRouter);
app.use("/api", mealPlansRouter);
app.use("/api", groceryRouter);
app.use("/api", pantryRouter);
app.use("/api", recipesRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`[rasoi] API listening on http://localhost:${env.PORT}`);
  console.log(`[rasoi] model: ${env.ANTHROPIC_MODEL}`);
});
