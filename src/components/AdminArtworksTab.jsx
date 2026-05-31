function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

function AdminArtworksTab({
  form,
  editingId,
  artworkFilter,
  filteredArtworks,
  adminArtworkPreviews,
  recommendationDebugById,
  duplicateCandidatesById,
  imageIntelligenceById,
  selectedImageSuggestions,
  selectedDuplicateCandidates,
  tagRegistry,
  studioSuggestion,
  newTagName,
  newTagType,
  tagQuery,
  onChange,
  onToggleFeaturedField,
  onSubmit,
  onCancelEdit,
  onSetArtworkFilter,
  onChangeArtworkStatus,
  onEditArtwork,
  onDeleteArtwork,
  onToggleArtworkFeatured,
  onSuggestArtworkTags,
  onToggleTagPill,
  onCreateTag,
  onTagQueryChange,
  onNewTagNameChange,
  onNewTagTypeChange,
  onStudioSuggest,
  onBulkPrefill,
}) {
  return (
    <section className="admin-tab-panel">
      <form className="admin-form" onSubmit={onSubmit}>
        <label>
          Image URL 1
          <input name="image1" value={form.image1} onChange={onChange} required />
        </label>
        <label>
          Image URL 2
          <input name="image2" value={form.image2} onChange={onChange} />
        </label>
        <label>
          Image URL 3
          <input name="image3" value={form.image3} onChange={onChange} />
        </label>
        <label>
          Image URL 4
          <input name="image4" value={form.image4} onChange={onChange} />
        </label>
        <label>
          Image URL 5
          <input name="image5" value={form.image5} onChange={onChange} />
        </label>
        <label>
          Title
          <input name="title" value={form.title} onChange={onChange} required />
        </label>
        <label>
          Price
          <input name="price" type="number" min="1" value={form.price} onChange={onChange} required />
        </label>
        <label>
          Description
          <textarea name="description" value={form.description} onChange={onChange} required />
        </label>
        <label>
          Tags
          <input
            name="tags"
            value={form.tags}
            onChange={onChange}
            placeholder="minimal, calm, spiritual"
          />
        </label>
        <label>
          Tag search
          <input
            value={tagQuery}
            onChange={(event) => onTagQueryChange(event.target.value)}
            placeholder="Search global tags..."
          />
        </label>
        <div className="mood-chip-row">
          {tagRegistry.map((tag) => {
            const currentTags = form.tags
              .split(',')
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean)
            const isActive = currentTags.includes(String(tag.name || '').toLowerCase())
            return (
              <button
                key={`tag-pill-${tag.id}`}
                type="button"
                className={`mood-chip ${isActive ? 'is-active' : ''}`}
                onClick={() => onToggleTagPill(tag.name)}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
        <div className="btn-row">
          <input
            value={newTagName}
            onChange={(event) => onNewTagNameChange(event.target.value)}
            placeholder="new tag"
          />
          <select value={newTagType} onChange={(event) => onNewTagTypeChange(event.target.value)}>
            <option value="style">style</option>
            <option value="mood">mood</option>
            <option value="color">color</option>
            <option value="subject">subject</option>
            <option value="space">space</option>
            <option value="energy">energy</option>
            <option value="medium">medium</option>
            <option value="collection">collection</option>
          </select>
          <button type="button" className="btn-secondary" onClick={onCreateTag}>
            + Add Tag
          </button>
        </div>
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={onSuggestArtworkTags}>
            Suggest Tags
          </button>
          <button type="button" className="btn-secondary" onClick={onStudioSuggest}>
            AI Studio Suggest
          </button>
        </div>
        {selectedImageSuggestions.length > 0 ? (
          <p>Image tag suggestions: {selectedImageSuggestions.join(', ')}</p>
        ) : null}
        {selectedDuplicateCandidates.length > 0 ? (
          <p>
            Possible duplicates:{' '}
            {selectedDuplicateCandidates
              .map((candidate) => `#${candidate.artwork_id} (${Math.round(candidate.score * 100)}%)`)
              .join(', ')}
          </p>
        ) : null}
        {studioSuggestion?.live_preview?.length ? (
          <div className="commission-brief-preview">
            <p><strong>Live AI Preview</strong></p>
            <p>This artwork will likely appear in:</p>
            {studioSuggestion.live_preview.map((reason) => (
              <p key={reason}>- {reason}</p>
            ))}
            <p>Recommendation confidence: {Math.round(Number(studioSuggestion.recommendation_confidence || 0) * 100)}%</p>
            <p>Metadata completeness: {Math.round(Number(studioSuggestion.metadata_completeness || 0))}%</p>
            <p>Search discoverability: {Math.round(Number(studioSuggestion.search_discoverability || 0))}%</p>
            <p>Artwork intelligence score: {Math.round(Number(studioSuggestion.health?.score || 0))}%</p>
            {Array.isArray(studioSuggestion.health?.suggestions) && studioSuggestion.health.suggestions.length > 0 ? (
              <p>Improvements: {studioSuggestion.health.suggestions.join(', ')}</p>
            ) : null}
          </div>
        ) : null}
        <label>
          Medium
          <input name="medium" value={form.medium} onChange={onChange} required />
        </label>
        <label>
          Size
          <input name="size" value={form.size} onChange={onChange} required />
        </label>
        <label>
          <input
            type="checkbox"
            name="is_featured"
            checked={form.is_featured}
            onChange={onToggleFeaturedField}
          />
          Featured on homepage
        </label>
        <label>
          Featured Rank
          <input
            name="featured_rank"
            type="number"
            min="0"
            step="1"
            value={form.featured_rank}
            onChange={onChange}
            placeholder="Lower appears first"
          />
        </label>
        <label>
          Quantity
          <input
            name="quantity"
            type="number"
            min="0"
            step="1"
            value={form.quantity}
            onChange={onChange}
            required
          />
        </label>
        <label>
          Status
          <select name="status" value={form.status} onChange={onChange}>
            <option value="available">available</option>
            <option value="sold">sold</option>
          </select>
        </label>
        <label>
          Category
          <select name="category" value={form.category} onChange={onChange}>
            <option value="canvas">canvas</option>
            <option value="sketch">sketch</option>
          </select>
        </label>
        <div className="btn-row">
          <button type="submit">{editingId ? 'Update Artwork' : 'Add Artwork'}</button>
          {editingId ? (
            <button type="button" className="btn-secondary" onClick={onCancelEdit}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>
      <section className="order-detail-card">
        <h3>Bulk Upload Studio</h3>
        <p>Paste one image URL per line to prefill upload metadata suggestions.</p>
        <textarea
          placeholder="https://...\nhttps://...\nhttps://..."
          onBlur={(event) => onBulkPrefill(event.target.value)}
        />
      </section>

      <div className="filter-row">
        <span>Artwork filter:</span>
        <button
          type="button"
          className={artworkFilter === 'all' ? 'btn-filter active' : 'btn-filter'}
          onClick={() => onSetArtworkFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={artworkFilter === 'available' ? 'btn-filter active' : 'btn-filter'}
          onClick={() => onSetArtworkFilter('available')}
        >
          Available
        </button>
        <button
          type="button"
          className={artworkFilter === 'sold' ? 'btn-filter active' : 'btn-filter'}
          onClick={() => onSetArtworkFilter('sold')}
        >
          Sold
        </button>
      </div>

      <div className="admin-list">
        {filteredArtworks.length === 0 ? (
          <p className="status-message">No artworks found.</p>
        ) : (
          filteredArtworks.map((artwork) => (
            <article key={artwork.id} className="admin-item">
              {adminArtworkPreviews.get(artwork.id) ? (
                <img
                  src={adminArtworkPreviews.get(artwork.id)}
                  alt={artwork.title}
                  loading="lazy"
                  decoding="async"
                  width="400"
                  height="400"
                />
              ) : null}
              <div>
                <h3>{artwork.title}</h3>
                <p>{formatPrice(artwork.price)}</p>
                <p>Medium: {artwork.medium}</p>
                <p>Size: {artwork.size}</p>
                <p>Stock: {artwork.quantity}</p>
                <p>Category: {artwork.category || 'canvas'}</p>
                <p>Tags: {Array.isArray(artwork.tags) && artwork.tags.length > 0 ? artwork.tags.join(', ') : 'none'}</p>
                <p>Featured Rank: {artwork.featured_rank ?? 'unset'}</p>
                <p>
                  Status:{' '}
                  <span className={`badge ${artwork.status === 'sold' ? 'sold' : 'available'}`}>
                    {artwork.status || 'available'}
                  </span>
                </p>
                <p>
                  Featured:{' '}
                  <span className={`badge ${artwork.is_featured ? 'available' : 'sold'}`}>
                    {artwork.is_featured ? 'yes' : 'no'}
                  </span>
                </p>
                <p>Why recommended: {recommendationDebugById.get(artwork.id)}</p>
                {imageIntelligenceById.get(artwork.id)?.style_hints?.length ? (
                  <p>Style hints: {imageIntelligenceById.get(artwork.id).style_hints.join(', ')}</p>
                ) : null}
                {duplicateCandidatesById.get(artwork.id)?.length ? (
                  <p>
                    Possible duplicates:{' '}
                    {duplicateCandidatesById
                      .get(artwork.id)
                      .map((candidate) => `#${candidate.artwork_id} (${Math.round(candidate.score * 100)}%)`)
                      .join(', ')}
                  </p>
                ) : null}
              </div>
              <div className="btn-col">
                <select
                  value={artwork.status || 'available'}
                  onChange={(event) => onChangeArtworkStatus(artwork.id, event.target.value)}
                >
                  <option value="available">available</option>
                  <option value="sold">sold</option>
                </select>
                <button type="button" onClick={() => onToggleArtworkFeatured(artwork)}>
                  {artwork.is_featured ? 'Unfeature' : 'Feature'}
                </button>
                <button type="button" onClick={() => onEditArtwork(artwork)}>
                  Edit
                </button>
                <button type="button" className="btn-danger" onClick={() => onDeleteArtwork(artwork.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export default AdminArtworksTab
