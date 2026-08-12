import { backendAdminRequest, backendRequest } from './backendApiService'

function normalizeTestimonial(testimonial) {
  return {
    id: testimonial.id,
    name: testimonial.name || '',
    content: testimonial.content || '',
    artwork_id: testimonial.artwork_id == null ? null : Number(testimonial.artwork_id),
    rating: testimonial.rating == null ? null : Number(testimonial.rating),
    is_featured: testimonial.is_featured === true,
    is_visible: testimonial.is_visible !== false,
    created_at: testimonial.created_at || null,
  }
}

export async function fetchTestimonials() {
  const payload = await backendRequest('/api/testimonials?featured=true')
  return (payload.data || []).map(normalizeTestimonial)
}

/** Visible reviews for one artwork, newest first. */
export async function fetchArtworkTestimonials(artworkId) {
  const payload = await backendRequest(`/api/testimonials?artwork_id=${Number(artworkId)}`)

  return (payload.data || [])
    .map(normalizeTestimonial)
    .filter((testimonial) => testimonial.artwork_id === Number(artworkId))
}

export async function fetchAdminTestimonials() {
  const payload = await backendAdminRequest('/api/testimonials')
  return (payload.data || []).map(normalizeTestimonial)
}

export async function addTestimonial(testimonialInput) {
  const payload = await backendAdminRequest('/api/testimonials', {
    method: 'POST',
    body: JSON.stringify(testimonialInput),
  })

  return normalizeTestimonial(payload.data)
}

export async function updateTestimonial(id, testimonialInput) {
  const payload = await backendAdminRequest(`/api/testimonials?id=${Number(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(testimonialInput),
  })

  return normalizeTestimonial(payload.data)
}

export async function deleteTestimonial(id) {
  const payload = await backendAdminRequest(`/api/testimonials?id=${Number(id)}`, {
    method: 'DELETE',
  })

  return payload.data
}
