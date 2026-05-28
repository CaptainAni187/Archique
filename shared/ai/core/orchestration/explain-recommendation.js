import { explainArtworkRecommendation, buildRecommendationReasons } from '../explainability/reasons.js'

export function explainRecommendation({ artwork = {}, tasteProfile = {}, scoreBreakdown = {} } = {}) {
  return {
    explanation: explainArtworkRecommendation(artwork, tasteProfile, scoreBreakdown),
    reasons: buildRecommendationReasons(artwork, tasteProfile, scoreBreakdown),
  }
}
