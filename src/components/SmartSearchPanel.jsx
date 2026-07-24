import { SMART_SEARCH_MOODS } from '../../shared/ai/core/index.js'

function SmartSearchPanel({
  query,
  moods,
  summary,
  source,
  isSearching,
  onQueryChange,
  onMoodToggle,
  onSubmit,
  onClear,
  toolbar = null,
}) {
  const canClear = Boolean(query) || moods.length > 0

  return (
    <section className="smart-search-panel" aria-label="Smart art search">
      <div className="smart-search-bar-row">
        <form className="smart-search-form" onSubmit={onSubmit} role="search">
          <div className="smart-search-input-wrap">
            <svg className="smart-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Ask AI — gift for mom, minimal room art…"
              aria-label="Ask AI to find artworks"
            />
            {isSearching ? <span className="smart-search-status" aria-hidden="true" /> : null}
            {canClear ? (
              <button
                type="button"
                className="smart-search-clear"
                onClick={onClear}
                aria-label="Clear search"
                title="Clear search"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : null}
          </div>
        </form>

        {toolbar ? <div className="smart-search-toolbar-slot">{toolbar}</div> : null}
      </div>

      <div className="mood-chip-row" aria-label="Mood filters">
        {SMART_SEARCH_MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            className={`mood-chip ${moods.includes(mood) ? 'is-active' : ''}`}
            onClick={() => onMoodToggle(mood)}
          >
            {mood}
          </button>
        ))}
      </div>

      {summary ? (
        <p className="smart-search-summary">
          {summary} <span>{source}</span>
        </p>
      ) : null}
    </section>
  )
}

export default SmartSearchPanel
