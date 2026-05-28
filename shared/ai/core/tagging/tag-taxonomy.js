export const TAG_TAXONOMY = {
  style: {
    anime: ['anime', 'manga', 'character', 'figure'],
    minimal: ['minimal', 'simple', 'clean', 'modern', 'neutral', 'subtle'],
    abstract: ['abstract', 'texture', 'form', 'expression'],
    portrait: ['portrait', 'face', 'person', 'couple', 'figure'],
    botanical: ['botanical', 'flower', 'leaf', 'nature', 'garden'],
    sketch: ['sketch', 'graphite', 'pencil', 'charcoal', 'study', 'drawing'],
    canvas: ['canvas', 'acrylic', 'painting'],
  },
  mood: {
    dark: ['dark', 'black', 'night', 'shadow', 'moody'],
    calm: ['calm', 'quiet', 'soft', 'peaceful', 'gentle', 'serene'],
    dreamy: ['dreamy', 'surreal', 'ethereal', 'float'],
    bold: ['bold', 'strong', 'dramatic', 'contrast', 'vivid', 'statement'],
    spiritual: ['spiritual', 'soul', 'divine', 'ritual', 'sacred', 'meditative', 'god'],
    romantic: ['romantic', 'love', 'warm', 'intimate'],
  },
  subject: {
    portrait: ['portrait', 'face', 'person', 'couple', 'family', 'mother', 'mom'],
    nature: ['nature', 'flower', 'leaf', 'sky', 'botanical'],
    spiritual: ['god', 'spiritual', 'divine', 'sacred'],
    memory: ['memory', 'personal', 'gift', 'home'],
    character: ['anime', 'manga', 'character', 'figure'],
  },
  color: {
    black: ['black', 'dark', 'night', 'shadow'],
    white: ['white', 'light', 'minimal', 'neutral'],
    blue: ['blue', 'sky', 'calm'],
    gold: ['gold', 'golden', 'warm'],
    red: ['red', 'romantic', 'bold'],
    green: ['green', 'leaf', 'nature', 'botanical'],
    neon: ['neon', 'cyberpunk', 'gaming'],
  },
  space: {
    bedroom: ['bedroom', 'calm', 'soft', 'personal'],
    studio: ['studio', 'creative', 'minimal', 'modern'],
    'gaming-room': ['gaming', 'anime', 'dark', 'neon', 'cyberpunk'],
    living: ['living', 'home', 'wall', 'room'],
    meditation: ['meditation', 'spiritual', 'calm', 'sacred'],
  },
}

export function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return []
  }

  return tags
    .map((tag) => normalizeText(tag))
    .filter((tag, index, collection) => tag && collection.indexOf(tag) === index)
}

export function tokenizeText(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean)
}

export function categorizeTags(tags = []) {
  const normalizedTags = normalizeTags(tags)
  const categorized = {
    style_tags: [],
    mood_tags: [],
    subject_tags: [],
    color_tags: [],
    space_tags: [],
    uncategorized_tags: [],
  }

  normalizedTags.forEach((tag) => {
    let matched = false

    Object.entries(TAG_TAXONOMY).forEach(([category, groups]) => {
      Object.entries(groups).forEach(([label, keywords]) => {
        if (label === tag || keywords.includes(tag)) {
          const key = `${category}_tags`
          if (!categorized[key].includes(label)) {
            categorized[key].push(label)
          }
          matched = true
        }
      })
    })

    if (!matched) {
      categorized.uncategorized_tags.push(tag)
    }
  })

  return categorized
}

export function inferTagsFromText(...values) {
  const text = values.map(normalizeText).filter(Boolean).join(' ')
  const inferred = []

  Object.values(TAG_TAXONOMY).forEach((groups) => {
    Object.entries(groups).forEach(([label, keywords]) => {
      if (keywords.some((keyword) => text.includes(keyword))) {
        inferred.push(label)
      }
    })
  })

  return normalizeTags(inferred)
}

export function suggestArtworkTags(artwork = {}) {
  const categoryTag = normalizeText(artwork.category)
  return normalizeTags([
    ...inferTagsFromText(artwork.title, artwork.description, artwork.medium, artwork.category),
    categoryTag,
  ]).slice(0, 10)
}
