import { useEffect } from 'react'

const DEFAULT_IMAGE = 'https://www.archique.in/og-image.png'

function upsertMeta(selector, attribute, value, content) {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, value)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

/**
 * Crawlers building link previews do not resolve relative paths, so every
 * shared image has to be an absolute URL. Stored artwork URLs already are;
 * anything else is made absolute against the current origin.
 */
function toAbsoluteUrl(value) {
  if (!value) {
    return DEFAULT_IMAGE
  }

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  try {
    return new URL(value, window.location.origin).href
  } catch {
    return DEFAULT_IMAGE
  }
}

export default function usePageMeta({ title, description, image, type = 'website' }) {
  useEffect(() => {
    if (title) {
      document.title = title
    }

    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description)
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', description)
      upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    }

    if (title) {
      upsertMeta('meta[property="og:title"]', 'property', 'og:title', title)
      upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
    }

    // Sharing an artwork should show that artwork, not the studio's default
    // card — for an art store this is most of the reason a link gets opened.
    const resolvedImage = toAbsoluteUrl(image)
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', resolvedImage)
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', resolvedImage)
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', type)
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', window.location.href)
  }, [title, description, image, type])
}
