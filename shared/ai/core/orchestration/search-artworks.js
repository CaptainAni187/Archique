import { searchArtworks as runSearchPipeline } from '../search/semantic-search.js'

export function searchArtworks(options = {}) {
  return runSearchPipeline(options)
}
