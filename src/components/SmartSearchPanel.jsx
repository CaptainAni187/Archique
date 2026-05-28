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
}) {
  return (
    <section className="smart-search-panel" aria-label="Smart art search">
      <form className="smart-search-form" onSubmit={onSubmit}>
        <label className="smart-search-field">
          <span>Ask AI</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="gift for mom, minimal room art, something bold and spiritual"
          />
        </label>
        <div className="smart-search-actions">
          <button type="submit" className="text-link-button" disabled={isSearching}>
            {isSearching ? 'Searching' : 'Search'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClear}>
            Clear
          </button>
        </div>
      </form>

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
