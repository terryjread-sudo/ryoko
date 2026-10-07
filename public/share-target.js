// Share Target requests already arrive at the app with their query parameters.
// Do not redirect them here: redirecting to the same URL makes the service
// worker handle its own redirect repeatedly and causes a browser redirect loop.
self.addEventListener('fetch', () => {})
