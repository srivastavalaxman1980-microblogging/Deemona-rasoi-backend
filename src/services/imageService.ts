import { env } from "../config/env";
import { normalizeItem } from "../lib/match";
import { getImageCache, setImageCache, PhotoResult } from "../repositories/media";

async function searchPexels(
  query: string,
  kind: "dish" | "ingredient"
): Promise<PhotoResult | null> {
  if (!env.PEXELS_API_KEY) return null;
  const orientation = kind === "dish" ? "landscape" : "square";
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=1&orientation=${orientation}`;

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(url, { headers: { Authorization: env.PEXELS_API_KEY } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data: any = await res.json();
  const photo = data?.photos?.[0];
  if (!photo) return null;

  const src =
    kind === "dish"
      ? photo.src?.landscape || photo.src?.large || photo.src?.medium
      : photo.src?.medium || photo.src?.small || photo.src?.tiny;
  if (!src) return null;

  return {
    url: src,
    creditName: photo.photographer || "",
    creditUrl: photo.url || "",
  };
}

/** Resolve a photo for a dish or ingredient, using the cache first. */
export async function resolveImage(
  kind: "dish" | "ingredient",
  name: string
): Promise<PhotoResult | null> {
  const key = normalizeItem(name) || name.toLowerCase().trim();
  if (!key) return null;

  const cached = await getImageCache(kind, key);
  if (cached) {
    return cached.image_url
      ? { url: cached.image_url, creditName: cached.credit_name, creditUrl: cached.credit_url }
      : null;
  }

  const query = kind === "dish" ? `${name} food dish` : name;
  const result = await searchPexels(query, kind);
  await setImageCache(kind, key, result);
  return result;
}
