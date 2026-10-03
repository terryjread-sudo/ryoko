export type InstagramPreview = { url: string; title: string; author: string; thumbnailUrl?: string; fallback: boolean }

export async function resolveInstagramUrl(url: string): Promise<InstagramPreview> {
  const fallback = { url, title: 'Saved from Instagram', author: 'Instagram link', fallback: true }
  try {
    const response = await fetch(`https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`)
    if (!response.ok) return fallback
    const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string }
    return { url, title: data.title || fallback.title, author: data.author_name || fallback.author, thumbnailUrl: data.thumbnail_url, fallback: false }
  } catch { return fallback }
}
