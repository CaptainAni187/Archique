import { useEffect, useMemo, useState } from 'react'
import { fetchArtworks } from '../services/artworkService'
import Reveal from '../components/Reveal'
import StoreCard from '../components/StoreCard'
import ErrorState from '../components/ErrorState'
import { SkeletonGrid } from '../components/SkeletonLoader'
import usePageMeta from '../hooks/usePageMeta'
import { getUserFriendlyError } from '../utils/userErrors'
import {
  getTasteProfile,
  hasTasteSignals,
  getRecommendationReason,
  rankArtworksByTaste,
} from '../services/tasteService'
import { trackAnalyticsEvent, trackRecommendationEvent } from '../services/analyticsService'
import SmartSearchPanel from '../components/SmartSearchPanel'
import StoreToolbar from '../components/StoreToolbar'
import { runSmartArtworkSearch } from '../services/smartSearchService'
import { fetchSavedArtworks, saveArtwork, unsaveArtwork } from '../services/userAuthService'

const ALL_CATEGORIES = 'all'
const DEFAULT_SORT = 'featured'
const ANY = 'any'

// Coarse price bands so buyers can narrow by budget without fiddly min/max
// inputs. Bounds are inclusive of min, exclusive of max.
const PRICE_BUCKETS = [
  { value: ANY, label: 'Any price', min: 0, max: Infinity },
  { value: 'under-1500', label: 'Under Rs. 1,500', min: 0, max: 1500 },
  { value: '1500-3000', label: 'Rs. 1,500 – 3,000', min: 1500, max: 3000 },
  { value: '3000-6000', label: 'Rs. 3,000 – 6,000', min: 3000, max: 6000 },
  { value: 'over-6000', label: 'Over Rs. 6,000', min: 6000, max: Infinity },
]

function sortArtworks(artworks, sortBy) {
  const sortedArtworks = [...artworks]

  switch (sortBy) {
    case 'price-low-high':
      return sortedArtworks.sort((left, right) => left.price - right.price)
    case 'price-high-low':
      return sortedArtworks.sort((left, right) => right.price - left.price)
    case 'title-a-z':
      return sortedArtworks.sort((left, right) => left.title.localeCompare(right.title))
    case 'newest':
      return sortedArtworks.sort((left, right) => Number(right.id) - Number(left.id))
    case 'featured':
    default:
      return sortedArtworks
  }
}

function Gallery() {
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [selectedAvailability, setSelectedAvailability] = useState(ANY)
  const [selectedSize, setSelectedSize] = useState(ANY)
  const [selectedPriceBucket, setSelectedPriceBucket] = useState(ANY)
  const [sortBy, setSortBy] = useState(DEFAULT_SORT)
  const [retryKey, setRetryKey] = useState(0)
  const [smartQuery, setSmartQuery] = useState('')
  const [selectedMoods, setSelectedMoods] = useState([])
  const [smartResults, setSmartResults] = useState([])
  const [smartSummary, setSmartSummary] = useState('')
  const [smartSource, setSmartSource] = useState('')
  const [isSmartSearching, setIsSmartSearching] = useState(false)
  const [savedArtworkIds, setSavedArtworkIds] = useState([])
  const [debugStats, setDebugStats] = useState(null)

  usePageMeta({
    title: 'Gallery | Archiverse',
    description: 'Browse curated artworks available at Archiverse.',
  })

  useEffect(() => {
    async function loadArtworks() {
      setLoading(true)
      try {
        const [response, saved] = await Promise.all([
          fetchArtworks(),
          fetchSavedArtworks().catch(() => []),
        ])
        const normalizedResponse = Array.isArray(response) ? response : []
        setArtworks(normalizedResponse)
        setSavedArtworkIds(saved.map((item) => Number(item.artwork_id)).filter(Boolean))
        if (import.meta.env.DEV) {
          console.debug('[gallery] loaded artworks payload', {
            count: normalizedResponse.length,
            sample: normalizedResponse.slice(0, 3).map((item) => ({
              id: item?.id,
              title: item?.title,
              tags: Array.isArray(item?.tags) ? item.tags.length : 'invalid',
            })),
          })
        }
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(
          getUserFriendlyError(error, 'We could not load the store right now.'),
        )
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [retryKey])

  useEffect(() => {
    if (loading) {
      return
    }

    if (
      selectedCategory === ALL_CATEGORIES &&
      selectedAvailability === ANY &&
      selectedSize === ANY &&
      selectedPriceBucket === ANY &&
      sortBy === DEFAULT_SORT
    ) {
      return
    }

    void trackAnalyticsEvent('search_query', {
      query: [selectedCategory, selectedAvailability, selectedSize, selectedPriceBucket, sortBy]
        .filter((value) => value && value !== ANY && value !== ALL_CATEGORIES)
        .join(' '),
      category: selectedCategory === ALL_CATEGORIES ? '' : selectedCategory,
      availability: selectedAvailability === ANY ? '' : selectedAvailability,
      size: selectedSize === ANY ? '' : selectedSize,
      price_bucket: selectedPriceBucket === ANY ? '' : selectedPriceBucket,
      sort_by: sortBy,
    })
  }, [loading, selectedAvailability, selectedCategory, selectedPriceBucket, selectedSize, sortBy])

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(
        artworks
          .map((artwork) => String(artwork.category || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    )

    return uniqueCategories.sort((left, right) => left.localeCompare(right))
  }, [artworks])

  const sizes = useMemo(() => {
    const uniqueSizes = Array.from(
      new Set(
        artworks
          .map((artwork) => String(artwork.size || '').trim())
          .filter((size) => size && size.toLowerCase() !== 'not specified'),
      ),
    )

    return uniqueSizes.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  }, [artworks])

  const hasSmartSearch = Boolean(smartQuery.trim() || selectedMoods.length > 0)

  const activeFilterCount =
    (selectedCategory !== ALL_CATEGORIES ? 1 : 0) +
    (selectedAvailability !== ANY ? 1 : 0) +
    (selectedSize !== ANY ? 1 : 0) +
    (selectedPriceBucket !== ANY ? 1 : 0)

  const clearFilters = () => {
    setSelectedCategory(ALL_CATEGORIES)
    setSelectedAvailability(ANY)
    setSelectedSize(ANY)
    setSelectedPriceBucket(ANY)
  }

  const filteredArtworks = useMemo(() => {
    const priceBucket =
      PRICE_BUCKETS.find((bucket) => bucket.value === selectedPriceBucket) || PRICE_BUCKETS[0]

    const smartResultById = new Map(
      smartResults.map((result) => [
        Number(result.artwork?.id),
        {
          explanation: result.explanation,
          score: result.score,
          source: result.source,
        },
      ]),
    )
    const sourceArtworks = hasSmartSearch
      ? smartResults.map((result) => result.artwork).filter(Boolean)
      : artworks

    const safeSourceArtworks = sourceArtworks.filter(
      (artwork) =>
        artwork &&
        typeof artwork === 'object' &&
        Number.isFinite(Number(artwork.id)) &&
        typeof artwork.title === 'string',
    )

    const matchingArtworks = safeSourceArtworks
      .map((artwork) => ({
        ...artwork,
        smart_explanation: smartResultById.get(Number(artwork.id))?.explanation || '',
        smart_score: smartResultById.get(Number(artwork.id))?.score || 0,
        smart_source: smartResultById.get(Number(artwork.id))?.source || '',
      }))
      .filter((artwork) => {
      const matchesCategory =
        selectedCategory === ALL_CATEGORIES || artwork.category === selectedCategory
      const isSold = artwork.status === 'sold'
      const matchesAvailability =
        selectedAvailability === ANY ||
        (selectedAvailability === 'available' && !isSold) ||
        (selectedAvailability === 'sold' && isSold)
      const matchesSize =
        selectedSize === ANY || String(artwork.size || '').trim() === selectedSize
      const price = Number(artwork.price) || 0
      const matchesPrice =
        selectedPriceBucket === ANY || (price >= priceBucket.min && price < priceBucket.max)

      return matchesCategory && matchesAvailability && matchesSize && matchesPrice
    })

    if (hasSmartSearch) {
      return matchingArtworks
    }

    if (sortBy === DEFAULT_SORT && hasTasteSignals(getTasteProfile())) {
      try {
        const ranked = rankArtworksByTaste(matchingArtworks, getTasteProfile())
        return Array.isArray(ranked) && ranked.length > 0 ? ranked : matchingArtworks
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[gallery] ranking failed, fallback to raw list', error)
        }
        return matchingArtworks
      }
    }

    return sortArtworks(matchingArtworks, sortBy)
  }, [
    artworks,
    hasSmartSearch,
    selectedAvailability,
    selectedCategory,
    selectedPriceBucket,
    selectedSize,
    smartResults,
    sortBy,
  ])

  useEffect(() => {
    const topRecommendations = (Array.isArray(filteredArtworks) ? filteredArtworks : []).slice(0, 12)
    topRecommendations.forEach((artwork, index) => {
      void trackRecommendationEvent('recommendation_shown', {
        artwork_id: artwork.id,
        rank_index: index,
        source: hasSmartSearch ? 'smart_search' : 'gallery',
        category: artwork.category || '',
        tags: Array.isArray(artwork.tags) ? artwork.tags : [],
        artwork,
      })
    })
  }, [filteredArtworks, hasSmartSearch])

  useEffect(() => {
    if (!hasSmartSearch) {
      setSmartResults([])
      setSmartSummary('')
      setSmartSource('')
      return undefined
    }

    let isCancelled = false
    const searchTimer = window.setTimeout(async () => {
      setIsSmartSearching(true)
      try {
        const response = await runSmartArtworkSearch({
          query: smartQuery,
          moods: selectedMoods,
          artworks,
        })

        if (!isCancelled) {
          setSmartResults(Array.isArray(response.results) ? response.results : [])
          setSmartSummary(response.summary || '')
          setSmartSource(response.source || '')
          setIsSmartSearching(false)
        }
      } catch (error) {
        if (!isCancelled) {
          setSmartResults([])
          setSmartSummary('')
          setSmartSource('')
          setIsSmartSearching(false)
        }
        if (import.meta.env.DEV) {
          console.warn('[gallery] smart search failed', error)
        }
      }
    }, 250)

    return () => {
      isCancelled = true
      window.clearTimeout(searchTimer)
    }
  }, [artworks, hasSmartSearch, selectedMoods, smartQuery])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }
    const invalidArtworks = artworks.filter(
      (artwork) =>
        !artwork ||
        !Number.isFinite(Number(artwork.id)) ||
        typeof artwork.title !== 'string' ||
        !Number.isFinite(Number(artwork.price)),
    )
    setDebugStats({
      artwork_count: artworks.length,
      ranked_count: filteredArtworks.length,
      invalid_artworks: invalidArtworks.length,
      smart_result_count: smartResults.length,
      has_smart_search: hasSmartSearch,
    })
  }, [artworks, filteredArtworks, smartResults, hasSmartSearch])

  const toggleMood = (mood) => {
    setSelectedMoods((current) =>
      current.includes(mood)
        ? current.filter((item) => item !== mood)
        : [...current, mood],
    )
  }

  const clearSmartSearch = () => {
    setSmartQuery('')
    setSelectedMoods([])
    setSmartResults([])
    setSmartSummary('')
    setSmartSource('')
  }

  if (loading) {
    return (
      <section className="page-flow page-with-header-gap">
        <Reveal className="portfolio-header">
          <p className="eyebrow">STORE</p>
          <p className="store-tagline">ORIGINAL WORKS AVAILABLE FOR COLLECTION.</p>
        </Reveal>
        <SkeletonGrid className="store-grid" count={6} />
      </section>
    )
  }

  if (errorMessage) {
    return (
      <ErrorState
        message={errorMessage}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    )
  }

  if (artworks.length === 0) {
    return <p className="status-message">No artworks found.</p>
  }

  return (
    <section className="page-flow page-with-header-gap">
      <Reveal className="portfolio-header">
        <p className="eyebrow">STORE</p>
        <p className="store-tagline">ORIGINAL WORKS AVAILABLE FOR COLLECTION.</p>
      </Reveal>
      <SmartSearchPanel
        query={smartQuery}
        moods={selectedMoods}
        summary={smartSummary}
        source={smartSource}
        isSearching={isSmartSearching}
        onQueryChange={setSmartQuery}
        onMoodToggle={toggleMood}
        onSubmit={(event) => event.preventDefault()}
        onClear={clearSmartSearch}
        toolbar={
          <StoreToolbar
            sortBy={sortBy}
            onSortChange={setSortBy}
            any={ANY}
            allCategories={ALL_CATEGORIES}
            categories={categories}
            sizes={sizes}
            priceBuckets={PRICE_BUCKETS}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            selectedAvailability={selectedAvailability}
            onAvailabilityChange={setSelectedAvailability}
            selectedSize={selectedSize}
            onSizeChange={setSelectedSize}
            selectedPriceBucket={selectedPriceBucket}
            onPriceBucketChange={setSelectedPriceBucket}
            onClearFilters={clearFilters}
            activeFilterCount={activeFilterCount}
          />
        }
      />

      {import.meta.env.DEV && debugStats ? (
        <p className="status-message">
          debug: artworks={debugStats.artwork_count}, ranked={debugStats.ranked_count}, invalid=
          {debugStats.invalid_artworks}, smart={debugStats.smart_result_count}
        </p>
      ) : null}

      {filteredArtworks.length === 0 ? (
        <p className="status-message">No artworks match the selected filters.</p>
      ) : (
        <div className="store-grid artwork-grid">
          {filteredArtworks.map((artwork) => (
            <StoreCard
              key={artwork.id}
              artwork={{
                ...artwork,
                recommendation_reason_label: artwork.smart_explanation
                  ? ''
                  : getRecommendationReason(artwork, getTasteProfile())
                      .replace(/^Shown because it\s*/i, '')
                      .replace(/\.$/, ''),
              }}
              isSaved={savedArtworkIds.includes(Number(artwork.id))}
              onToggleSave={async () => {
                const isSaved = savedArtworkIds.includes(Number(artwork.id))
                if (isSaved) {
                  await unsaveArtwork(artwork.id).catch(() => null)
                  setSavedArtworkIds((current) =>
                    current.filter((value) => value !== Number(artwork.id)),
                  )
                  void trackRecommendationEvent('favorite_removed', {
                    artwork_id: artwork.id,
                    source: 'gallery',
                    artwork,
                  })
                  return
                }
                await saveArtwork(artwork.id).catch(() => null)
                setSavedArtworkIds((current) =>
                  current.includes(Number(artwork.id)) ? current : [...current, Number(artwork.id)],
                )
                void trackRecommendationEvent('favorite_added', {
                  artwork_id: artwork.id,
                  source: 'gallery',
                  artwork,
                })
                void trackRecommendationEvent('recommendation_saved', {
                  artwork_id: artwork.id,
                  source: 'gallery',
                  artwork,
                })
              }}
            />
          ))}
        </div>
      )}

      <p className="store-results-count store-results-count-footer">
        Showing {filteredArtworks.length} of {artworks.length} artworks
      </p>
    </section>
  )
}

export default Gallery
