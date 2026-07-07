import { backendRequest } from './backendApiService'
import { setTasteProfile } from './tasteService'

const USER_TOKEN_KEY = 'archiverse_user_token'
const USER_PROFILE_KEY = 'archiverse_user_profile'

function storeSession(payload) {
  localStorage.setItem(USER_TOKEN_KEY, payload.token)
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload.user))
  return payload.user
}

export function getUserToken() {
  return localStorage.getItem(USER_TOKEN_KEY)
}

export function getStoredUser() {
  const rawUser = localStorage.getItem(USER_PROFILE_KEY)

  try {
    return rawUser ? JSON.parse(rawUser) : null
  } catch {
    return null
  }
}

export async function signupUser({ name, email, password }) {
  const payload = await backendRequest('/api/user/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })

  return storeSession(payload)
}

export async function loginUser({ email, password }) {
  const payload = await backendRequest('/api/user/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  return storeSession(payload)
}

export async function logoutUser() {
  await backendRequest('/api/user/logout', {
    method: 'POST',
  })
  localStorage.removeItem(USER_TOKEN_KEY)
  localStorage.removeItem(USER_PROFILE_KEY)
}

export async function fetchCurrentUser() {
  const token = getUserToken()

  if (!token) {
    return null
  }

  try {
    const payload = await backendRequest('/api/user/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (payload.user?.taste_profile) {
      setTasteProfile(payload.user.taste_profile)
    }
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload.user))
    return payload.user
  } catch {
    localStorage.removeItem(USER_TOKEN_KEY)
    localStorage.removeItem(USER_PROFILE_KEY)
    return null
  }
}

export async function fetchUserOrders() {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/orders', {
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })

  return payload.orders
}

export async function fetchSavedArtworks() {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/saved-artworks', {
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })
  return Array.isArray(payload.saved_artworks) ? payload.saved_artworks : []
}

export async function saveArtwork(artworkId) {
  const token = getUserToken()
  return backendRequest('/api/user/saved-artworks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ artwork_id: artworkId }),
  })
}

export async function unsaveArtwork(artworkId) {
  const token = getUserToken()
  return backendRequest('/api/user/saved-artworks', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ artwork_id: artworkId }),
  })
}

export async function fetchPersonalizationSummary() {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/personalization', {
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })
  return payload.data || {}
}

export async function updateAccountSettings(settings) {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/settings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify(settings),
  })
  if (payload.user) {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload.user))
  }
  return payload.user || null
}

export async function exportMyData() {
  const token = getUserToken()
  return backendRequest('/api/user/export', {
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })
}

export async function deleteMyAccount() {
  const token = getUserToken()
  await backendRequest('/api/user/delete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })
  localStorage.removeItem(USER_TOKEN_KEY)
  localStorage.removeItem(USER_PROFILE_KEY)
}

export async function fetchCollections() {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/collections', {
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })
  return Array.isArray(payload.collections) ? payload.collections : []
}

export async function createCollection(name) {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/collections', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ name }),
  })
  return payload.collection || null
}

export async function addArtworkToCollection(collectionId, artworkId) {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/collections', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ collection_id: collectionId, artwork_id: artworkId }),
  })
  return payload.item || null
}

export async function removeCollectionItem(itemId) {
  const token = getUserToken()
  return backendRequest('/api/user/collections', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ item_id: itemId }),
  })
}

export async function fetchRoomProfiles() {
  const token = getUserToken()
  if (!token) {
    return []
  }

  try {
    const payload = await backendRequest('/api/user/room-profiles', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return Array.isArray(payload.profiles) ? payload.profiles : []
  } catch {
    return []
  }
}

export async function saveRoomProfile({ label, space_type, room_personality, profile }) {
  const token = getUserToken()
  const payload = await backendRequest('/api/user/room-profiles', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({
      label,
      space_type,
      room_personality,
      profile,
    }),
  })
  return payload.profile || null
}

export async function deleteRoomProfile(profileId) {
  const token = getUserToken()
  return backendRequest('/api/user/room-profiles', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ profile_id: profileId }),
  })
}
