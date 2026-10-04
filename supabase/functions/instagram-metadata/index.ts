const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const meta = (html: string, property: string) => {
  const first = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)
  const second = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i').exec(html)
  return (first?.[1] || second?.[1] || '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405)
  try {
    const payload = await request.json() as { url?: unknown }
    const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : ''
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const pathname = parsed.pathname.replace(/\/+$/, '')
    if (hostname !== 'instagram.com' || !/^\/(p|reel|tv)\/[^/]+$/i.test(pathname)) {
      return json({ ok: false, error: 'A valid Instagram post, Reel, or video URL is required.' }, 400)
    }
    parsed.pathname = `${pathname}/`
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; RyokoMetadata/1.0)', Accept: 'text/html,application/json' }
    const [oembedResult, pageResult] = await Promise.allSettled([
      fetch(`https://www.instagram.com/oembed/?url=${encodeURIComponent(parsed.toString())}`, { headers }),
      fetch(parsed.toString(), { headers }),
    ])
    const oembed = oembedResult.status === 'fulfilled' && oembedResult.value.ok ? await oembedResult.value.json() : {}
    const html = pageResult.status === 'fulfilled' && pageResult.value.ok ? await pageResult.value.text() : ''
    const description = meta(html, 'og:description') || oembed.title || undefined
    return json({
      ok: true,
      title: oembed.title || meta(html, 'og:title') || 'Saved from Instagram',
      description,
      author: oembed.author_name || 'Instagram creator',
      location: meta(html, 'place:location:name') || html.match(/"locationName":"([^"]+)"/)?.[1],
      thumbnailUrl: oembed.thumbnail_url || meta(html, 'og:image') || undefined,
    })
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Unable to read metadata' }, 400)
  }
})
