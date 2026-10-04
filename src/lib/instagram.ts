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
    if (!supabase) return fallback;
    const { data, error } = await supabase.functions.invoke(
      "instagram-metadata",
      { body: { url } },
    );
    if (error || !data?.ok)
      return {
        ...fallback,
        error: data?.error || error?.message || "Metadata lookup failed",
      };
    return {
      url,
      title: data.title || fallback.title,
      description: data.description,
      author: data.author || fallback.author,
      location: data.location,
      thumbnailUrl: data.thumbnailUrl,
      error: data.error,
      fallback: false,
    };
  } catch {
    return fallback;
  }
}
