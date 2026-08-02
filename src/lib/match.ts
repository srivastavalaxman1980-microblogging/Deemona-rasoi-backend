// Loose ingredient-name matching so pantry items can be subtracted from a
// grocery list even when wording differs ("Onion" vs "Onions", "Toor dal" vs
// "Toor dal (arhar)"). Intentionally forgiving; false positives just mean an
// item is treated as already owned.

const NOISE = new Set([
  "fresh", "whole", "powder", "seeds", "leaves", "dried", "raw", "chopped",
  "kg", "g", "ml", "l", "packet", "pack", "pcs", "bunch",
]);

export function normalizeItem(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t))
    .join(" ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizeItem(s).split(" ").filter(Boolean);
}

/** True if two ingredient names plausibly refer to the same thing. */
export function itemsMatch(a: string, b: string): boolean {
  const na = normalizeItem(a);
  const nb = normalizeItem(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = tokens(a);
  const tb = tokens(b);
  for (const x of ta) {
    for (const y of tb) {
      if (x === y && x.length >= 3) return true;
      if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) {
        return true;
      }
    }
  }
  return false;
}

/** True if `item` matches any name in the pantry list. */
export function inPantry(item: string, pantryNames: string[]): boolean {
  return pantryNames.some((p) => itemsMatch(item, p));
}
