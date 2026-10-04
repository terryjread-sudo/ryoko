self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (requestUrl.searchParams.has('url') || requestUrl.searchParams.has('text')) {
    event.respondWith(Response.redirect('/?' + requestUrl.searchParams.toString(), 303))
  }
})
