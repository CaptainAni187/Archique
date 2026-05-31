function AdminAiStudioTab({
  metrics,
  governance,
  sandbox,
  sandboxArtworkId,
  sandboxTags,
  onSandboxArtworkIdChange,
  onSandboxTagsChange,
  onRunSandbox,
  onMergeTags,
  onRenameTag,
  onDeprecateTag,
}) {
  return (
    <section className="admin-tab-panel">
      <h3>AI Studio</h3>
      <section className="order-detail-card">
        <h3>Recommendation Sandbox</h3>
        <label>
          Artwork ID
          <input
            type="number"
            min="1"
            value={sandboxArtworkId}
            onChange={(event) => onSandboxArtworkIdChange(event.target.value)}
          />
        </label>
        <label>
          Tag Combination
          <input
            value={sandboxTags}
            onChange={(event) => onSandboxTagsChange(event.target.value)}
            placeholder="dark, emotional, blue"
          />
        </label>
        <button type="button" className="text-link-button" onClick={onRunSandbox}>
          Run Sandbox
        </button>
        {sandbox?.artwork_id ? (
          <div className="dashboard-daily-list">
            <p><span>Rank</span><strong>{sandbox.rank}</strong></p>
            <p><span>Confidence</span><strong>{Math.round(Number(sandbox.recommendation_confidence || 0) * 100)}%</strong></p>
            <p><span>Search discoverability</span><strong>{sandbox.search_discoverability || 0}%</strong></p>
            <p><span>Diversity penalty</span><strong>{sandbox.diversity_penalty || 0}</strong></p>
          </div>
        ) : null}
      </section>

      <section className="order-detail-card">
        <h3>Tag Governance</h3>
        <div className="dashboard-daily-list">
          {(governance.tags || []).slice(0, 20).map((tag) => (
            <p key={`gov-tag-${tag.id}`}>
              <span>{tag.name} ({tag.type})</span>
              <strong>
                <button type="button" className="text-link-button" onClick={() => onRenameTag(tag.id, tag.name)}>
                  Rename
                </button>
                <button type="button" className="text-link-button" onClick={() => onDeprecateTag(tag.id)}>
                  Deprecate
                </button>
                <button type="button" className="text-link-button" onClick={() => onMergeTags(tag.name)}>
                  Merge
                </button>
              </strong>
            </p>
          ))}
        </div>
      </section>
      <div className="stats-grid">
        <article className="stat-card">
          <p>Unique Active Tags</p>
          <strong>{metrics.recommendation_diversity_metrics?.unique_active_tags || 0}</strong>
        </article>
        <article className="stat-card">
          <p>Active Artworks</p>
          <strong>{metrics.recommendation_diversity_metrics?.active_artworks || 0}</strong>
        </article>
        <article className="stat-card">
          <p>Artworks Without Tags</p>
          <strong>{metrics.search_quality_diagnostics?.artworks_without_tags || 0}</strong>
        </article>
        <article className="stat-card">
          <p>Missing Descriptions</p>
          <strong>{metrics.search_quality_diagnostics?.artworks_without_description || 0}</strong>
        </article>
      </div>
      <section className="order-detail-card dashboard-daily-orders">
        <h3>Top Performing Tags</h3>
        <div className="dashboard-daily-list">
          {(metrics.top_performing_tags || []).slice(0, 12).map((item) => (
            <p key={`top-tag-${item.tag}`}>
              <span>{item.tag}</span>
              <strong>{item.purchases + item.saves + item.clicks}</strong>
            </p>
          ))}
        </div>
      </section>
      <section className="order-detail-card dashboard-daily-orders">
        <h3>Low Confidence Artworks</h3>
        <div className="dashboard-daily-list">
          {(metrics.low_confidence_artworks || []).slice(0, 12).map((item) => (
            <p key={`low-confidence-${item.id}`}>
              <span>{item.title}</span>
              <strong>{Array.isArray(item.tags) ? item.tags.length : 0} tags</strong>
            </p>
          ))}
        </div>
      </section>
      <section className="order-detail-card dashboard-daily-orders">
        <h3>Weak Recommendation Coverage</h3>
        <div className="dashboard-daily-list">
          {(metrics.weak_recommendation_coverage || []).slice(0, 12).map((item) => (
            <p key={`weak-coverage-${item.id}`}>
              <span>{item.title}</span>
              <strong>{Array.isArray(item.tags) ? item.tags.join(', ') : 'no tags'}</strong>
            </p>
          ))}
        </div>
      </section>
    </section>
  )
}

export default AdminAiStudioTab
