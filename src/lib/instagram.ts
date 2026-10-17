import { supabase } from "./supabase";

export type InstagramPreview = {
  url: string;
  title: string;
  description?: string;
  author: string;
  location?: string;
  thumbnailUrl?: string;
  fallback: boolean;
  error?: string;
};

export async function resolveInstagramUrl(
  url: string,
): Promise<InstagramPreview> {
  const fallback = {
    url,
    title: "Saved from Instagram",
    author: "Instagram link",
    fallback: true,
  };
  try {
    if (!supabase)
      return { ...fallback, error: "Supabase is not configured." };
    const { data, error } = await supabase.functions.invoke(
      "instagram-metadata",
      { body: { url } },
    );
    if (error || !data?.ok)
      return {
        ...fallback,
        error: data?.error || error?.message || "Metadata lookup failed",
      };
    const title = data.title || fallback.title;
    const description = data.description || undefined;
    const author = data.author || fallback.author;
    const location = data.location || undefined;
    const thumbnailUrl = data.thumbnailUrl || undefined;
    const hasMetadata = Boolean(
      (title && title !== fallback.title) ||
      (author && author !== fallback.author && author !== "Instagram creator") ||
      description ||
      location ||
      thumbnailUrl,
    );
    return {
      url,
      title,
      description,
      author,
      location,
      thumbnailUrl,
      error: hasMetadata ? data.error : "Instagram returned no usable metadata.",
      fallback: !hasMetadata,
    };
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "Metadata lookup failed.",
    };
  }
}

export async function resolveInstagramUrlWithRetry(
  url: string,
  maxAttempts = 3,
): Promise<InstagramPreview> {
  let preview: InstagramPreview = {
    url,
    title: "Saved from Instagram",
    author: "Instagram link",
    fallback: true,
  };
  const attempts = Math.max(1, Math.floor(maxAttempts));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    preview = await resolveInstagramUrl(url);
    if (!preview.fallback) return preview;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  return preview;
}
