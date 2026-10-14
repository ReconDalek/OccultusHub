// Torn-hosted avatar images (and the old torn.com fallback image itself) can
// go unreachable — e.g. Torn blocked on a work network — leaving a broken
// image icon. These fallbacks are served from our own domain so an avatar
// never actually breaks, just shows a generic headshot instead.
export const FALLBACK_AVATARS = ['/avatars/fallback-male.png', '/avatars/fallback-female.png']

// We don't store gender, so this is just a deterministic pick per seed (the
// same person gets the same silhouette every time, instead of it flickering
// between the two on every reload) rather than true random.
export function fallbackAvatarFor(seed) {
  if (seed == null) return FALLBACK_AVATARS[Math.floor(Math.random() * FALLBACK_AVATARS.length)]
  const s = String(seed)
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return FALLBACK_AVATARS[hash % FALLBACK_AVATARS.length]
}
