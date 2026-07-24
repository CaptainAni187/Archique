import { useEffect, useRef, useState } from 'react'

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-low-high', label: 'Price: Low to high' },
  { value: 'price-high-low', label: 'Price: High to low' },
  { value: 'title-a-z', label: 'Title: A to Z' },
]

function formatCategoryLabel(category) {
  if (!category) {
    return 'Uncategorized'
  }
  return category.charAt(0).toUpperCase() + category.slice(1)
}

function CheckIcon() {
  return (
    <svg className="store-menu-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

/**
 * Store toolbar with two controls — "Sort by" and "Filter" — each opening its
 * own panel of options, the way Amazon/Flipkart do it. Filters apply live; a
 * badge shows how many are active, and one action clears them all.
 */
function StoreToolbar({
  sortBy,
  onSortChange,
  any,
  allCategories,
  categories,
  sizes,
  priceBuckets,
  selectedCategory,
  onCategoryChange,
  selectedAvailability,
  onAvailabilityChange,
  selectedSize,
  onSizeChange,
  selectedPriceBucket,
  onPriceBucketChange,
  onClearFilters,
  activeFilterCount,
}) {
  const [openMenu, setOpenMenu] = useState(null) // 'sort' | 'filter' | null
  const containerRef = useRef(null)

  useEffect(() => {
    if (!openMenu) {
      return undefined
    }

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpenMenu(null)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu])

  const toggle = (menu) => setOpenMenu((current) => (current === menu ? null : menu))

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortBy)?.label || 'Featured'

  const renderOption = (isActive, label, onClick, key) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={isActive}
      className={`store-menu-option ${isActive ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {isActive ? <CheckIcon /> : null}
    </button>
  )

  return (
    <div className="store-toolbar" ref={containerRef}>
      {/* Sort */}
      <div className="store-toolbar-control">
        <button
          type="button"
          className={`store-toolbar-trigger ${openMenu === 'sort' ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'sort'}
          onClick={() => toggle('sort')}
        >
          <span>
            Sort by<span className="store-toolbar-value">: {sortLabel}</span>
          </span>
          <svg className="store-toolbar-caret" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openMenu === 'sort' ? (
          <div className="store-menu" role="menu">
            {SORT_OPTIONS.map((option) =>
              renderOption(
                sortBy === option.value,
                option.label,
                () => {
                  onSortChange(option.value)
                  setOpenMenu(null)
                },
                option.value,
              ),
            )}
          </div>
        ) : null}
      </div>

      {/* Filter */}
      <div className="store-toolbar-control">
        <button
          type="button"
          className={`store-toolbar-trigger ${openMenu === 'filter' ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={openMenu === 'filter'}
          onClick={() => toggle('filter')}
        >
          <span>
            Filter
            {activeFilterCount > 0 ? (
              <span className="store-toolbar-badge">{activeFilterCount}</span>
            ) : null}
          </span>
          <svg className="store-toolbar-caret" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openMenu === 'filter' ? (
          <div className="store-menu store-filter-menu" role="menu">
            <div className="store-filter-group">
              <p className="store-filter-group-title">Type</p>
              {renderOption(selectedCategory === allCategories, 'All', () =>
                onCategoryChange(allCategories), 'cat-all')}
              {categories.map((category) =>
                renderOption(
                  selectedCategory === category,
                  formatCategoryLabel(category),
                  () => onCategoryChange(category),
                  `cat-${category}`,
                ),
              )}
            </div>

            <div className="store-filter-group">
              <p className="store-filter-group-title">Price</p>
              {priceBuckets.map((bucket) =>
                renderOption(
                  selectedPriceBucket === bucket.value,
                  bucket.label,
                  () => onPriceBucketChange(bucket.value),
                  `price-${bucket.value}`,
                ),
              )}
            </div>

            <div className="store-filter-group">
              <p className="store-filter-group-title">Availability</p>
              {renderOption(selectedAvailability === any, 'All', () =>
                onAvailabilityChange(any), 'avail-any')}
              {renderOption(selectedAvailability === 'available', 'Available', () =>
                onAvailabilityChange('available'), 'avail-available')}
              {renderOption(selectedAvailability === 'sold', 'Sold out', () =>
                onAvailabilityChange('sold'), 'avail-sold')}
            </div>

            {sizes.length > 0 ? (
              <div className="store-filter-group">
                <p className="store-filter-group-title">Size</p>
                {renderOption(selectedSize === any, 'All sizes', () =>
                  onSizeChange(any), 'size-any')}
                {sizes.map((size) =>
                  renderOption(
                    selectedSize === size,
                    size,
                    () => onSizeChange(size),
                    `size-${size}`,
                  ),
                )}
              </div>
            ) : null}

            <div className="store-filter-footer">
              <button
                type="button"
                className="store-filter-clear"
                onClick={onClearFilters}
                disabled={activeFilterCount === 0}
              >
                Clear all
              </button>
              <button
                type="button"
                className="store-filter-done"
                onClick={() => setOpenMenu(null)}
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default StoreToolbar
