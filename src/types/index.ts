export type Diet = "Veg" | "Non-veg" | "Vegan" | "Jain" | "Satvik";
export type Goal =
  | "Balanced"
  | "Weight loss"
  | "Muscle gain"
  | "Diabetic-friendly"
  | "Kids nutrition";
export type MealType = "breakfast" | "lunch" | "snack" | "dinner";
export type Span = "week" | "month";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

/** The inputs the AI meal engine plans against. */
export interface HouseholdConstraints {
  adults: number;
  kids: number;
  diet: string;
  region: string;
  maxCookMin: number;
  goal: string;
  dailyBudgetInr: number;
  allergies: string[];
  occasion: string;
}

/** Persisted household row. */
export interface Household extends HouseholdConstraints {
  id: string;
  userId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** A single dish produced by the engine. */
export interface MealDraft {
  mealType: MealType;
  dish: string;
  proteinG: number;
  kcal: number;
  cookMin: number;
  isVeg: boolean;
}

/** A day of meals produced by the engine. */
export interface DayDraft {
  dayIndex: number;
  label: string;
  meals: MealDraft[];
}

/** A grocery line item produced by the engine. */
export interface GroceryItemDraft {
  item: string;
  quantity: string;
  category: string;
  costInr: number;
  isHave?: boolean;
}

export interface PantryItem {
  id: string;
  householdId: string;
  item: string;
  quantity: string;
  category: string;
  expiryDate: string | null;
  createdAt: string;
}

export interface GroceryDraft {
  items: GroceryItemDraft[];
  totalInr: number;
}

/** Compute a household daily protein target (grams). */
export function proteinTarget(c: Pick<HouseholdConstraints, "adults" | "kids" | "goal">): number {
  const perAdult = c.goal === "Muscle gain" ? 68 : 55;
  return c.adults * perAdult + c.kids * 32;
}
