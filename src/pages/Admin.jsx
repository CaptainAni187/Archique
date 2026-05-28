import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addArtwork,
  deleteArtwork,
  fetchArtworks,
  updateArtwork,
  updateArtworkStatus,
} from '../services/artworkService'
import {
  createAdminCombo,
  deleteAdminCombo,
  fetchAdminCombos,
  updateAdminCombo,
} from '../services/comboService'
import { fetchOrders, updateOrderPaymentStatus } from '../services/orderService'
import { fetchCommissions, updateCommissionStatus } from '../services/commissionService'
import { emptyDashboard, fetchDashboardAnalytics } from '../services/adminDashboardService'
import { backendAdminRequest } from '../services/backendApiService'
import { ORDER_STATUSES } from '../constants/orderStatus'
import {
  fetchAdminSession,
  logoutAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
} from '../services/adminAuthService'
import {
  addTestimonial,
  fetchAdminTestimonials,
  updateTestimonial,
} from '../services/testimonialService'
import usePageMeta from '../hooks/usePageMeta'
import AdminSidebar from '../components/AdminSidebar'
import AdminDashboardTab from '../components/AdminDashboardTab'
import AdminArtworksTab from '../components/AdminArtworksTab'
import AdminCombosTab from '../components/AdminCombosTab'
import AdminOrdersTab from '../components/AdminOrdersTab'
import AdminTestimonialsTab from '../components/AdminTestimonialsTab'
import AdminInquiriesTab from '../components/AdminInquiriesTab'
import AdminCommissionsTab from '../components/AdminCommissionsTab'
import AdminSettingsTab from '../components/AdminSettingsTab'
import {
  getAutoTagSuggestions,
  getRecommendationReason,
  getTasteProfile,
  resetTastePreferences,
} from '../services/tasteService'
import {
  getDuplicateArtworkMatches,
  getImageIntelligenceEntryByArtworkId,
  getImageTagSuggestions,
  loadImageIntelligenceArtifact,
} from '../services/imageIntelligenceService'

const initialForm = {
  image1: '',
  image2: '',
  image3: '',
  image4: '',
  image5: '',
  title: '',
  price: '',
  description: '',
  medium: '',
  size: '',
  is_featured: false,
  featured_rank: '',
  tags: '',
  quantity: '1',
  status: 'available',
  category: 'canvas',
}

const initialTestimonialForm = {
  name: '',
  content: '',
  rating: '',
  artwork_id: '',
  is_featured: false,
}

const initialComboForm = {
  title: '',
  artwork_ids: [],
  discount_percent: '10',
  is_active: true,
}

const initialPasswordForm = {
  resetEmail: '',
  resetToken: '',
  newPassword: '',
}

const inquiryReadStorageKey = 'archiverse_admin_inquiry_read_state'
const adminTabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'artworks', label: 'Artworks' },
  { id: 'combos', label: 'Combos' },
  { id: 'orders', label: 'Orders' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'inquiries', label: 'Inquiries' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'settings', label: 'Settings' },
]

function readInquiryState() {
  try {
    const raw = localStorage.getItem(inquiryReadStorageKey)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeInquiryState(nextState) {
  localStorage.setItem(inquiryReadStorageKey, JSON.stringify(nextState))
}

function Admin() {
  usePageMeta({
    title: 'Admin Dashboard | Archiverse',
    description: 'Manage artworks and orders in the Archiverse admin dashboard.',
  })

  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [artworks, setArtworks] = useState([])
  const [combos, setCombos] = useState([])
  const [orders, setOrders] = useState([])
  const [commissions, setCommissions] = useState([])
  const [inquiries, setInquiries] = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [dashboardStats, setDashboardStats] = useState(emptyDashboard)
  const [adminSession, setAdminSession] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [artworkFilter, setArtworkFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [testimonialForm, setTestimonialForm] = useState(initialTestimonialForm)
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm)
  const [inquiryReadState, setInquiryReadState] = useState({})
  const [imageIntelligence, setImageIntelligence] = useState(null)
  const [comboForm, setComboForm] = useState(initialComboForm)
  const [editingComboId, setEditingComboId] = useState(null)

  const loadArtworks = async () => {
    const response = await fetchArtworks()
    setArtworks(response)
  }

  const loadOrders = async () => {
    const response = await fetchOrders()
    setOrders(response)
  }

  const loadCombos = async () => {
    const response = await fetchAdminCombos()
    setCombos(response)
  }

  const loadCommissions = async () => {
    const response = await fetchCommissions()
    setCommissions(response)
  }

  const loadDashboardStats = async () => {
    const response = await fetchDashboardAnalytics()
    setDashboardStats(response)
  }

  const loadTestimonials = async () => {
    const response = await fetchAdminTestimonials()
    setTestimonials(response)
  }

  const loadActivityLogs = async () => {
    const response = await backendAdminRequest('/api/admin/activity')
    setActivityLogs(Array.isArray(response.data) ? response.data : [])
  }

  useEffect(() => {
    let isCancelled = false

    async function loadData() {
      setLoading(true)
      try {
        const [
          artworkResponse,
          comboResponse,
          orderResponse,
          commissionResponse,
          inquiryResponse,
          dashboardResponse,
          testimonialResponse,
          sessionResponse,
          activityResponse,
        ] = await Promise.all([
          fetchArtworks(),
          fetchAdminCombos(),
          fetchOrders(),
          fetchCommissions(),
          backendAdminRequest('/api/inquiries'),
          fetchDashboardAnalytics(),
          fetchAdminTestimonials(),
          fetchAdminSession(),
          backendAdminRequest('/api/admin/activity'),
        ])

        if (!isCancelled) {
          const inquiryRows = Array.isArray(inquiryResponse.data) ? inquiryResponse.data : []
          const persistedInquiryState = inquiryRows.reduce((accumulator, inquiry) => {
            accumulator[inquiry.id] = inquiry.is_read === true
            return accumulator
          }, {})

          setArtworks(artworkResponse)
          setCombos(comboResponse)
          setOrders(orderResponse)
          setCommissions(commissionResponse)
          setInquiries(inquiryRows)
          setDashboardStats(dashboardResponse)
          setTestimonials(testimonialResponse)
          setAdminSession(sessionResponse.data || null)
          setActivityLogs(Array.isArray(activityResponse.data) ? activityResponse.data : [])
          setPasswordForm((previous) => ({
            ...previous,
            resetEmail: sessionResponse.data?.admin?.email || previous.resetEmail,
          }))
          setSelectedOrderId((previous) => previous || orderResponse[0]?.id || null)
          setInquiryReadState({
            ...readInquiryState(),
            ...persistedInquiryState,
          })
          setErrorMessage('')
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(`Could not load admin data: ${error.message}`)
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadImageIntelligence() {
      const artifact = await loadImageIntelligenceArtifact()

      if (!isCancelled) {
        setImageIntelligence(artifact)
      }
    }

    loadImageIntelligence()

    return () => {
      isCancelled = true
    }
  }, [])

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const onChangeComboField = (event) => {
    const { name, value, type, checked } = event.target
    setComboForm((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const onToggleComboArtwork = (artworkId) => {
    setComboForm((previous) => {
      const normalizedId = Number(artworkId)
      const alreadySelected = previous.artwork_ids.includes(normalizedId)
      const nextArtworkIds = alreadySelected
        ? previous.artwork_ids.filter((id) => id !== normalizedId)
        : [...previous.artwork_ids, normalizedId].slice(0, 5)

      return {
        ...previous,
        artwork_ids: nextArtworkIds,
      }
    })
  }

  const getImageFields = (value) =>
    [value.image1, value.image2, value.image3, value.image4, value.image5]
      .map((image) => image.trim())
      .filter(Boolean)

  const onSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    const normalizedTitle = form.title.trim()
    const normalizedPrice = Number(form.price)

    if (!normalizedTitle) {
      setErrorMessage('Artwork title is required.')
      return
    }

    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      setErrorMessage('Artwork price must be greater than 0.')
      return
    }

    const images = getImageFields(form)

    if (images.length === 0) {
      setErrorMessage('At least one image URL is required.')
      return
    }

    if (images.length > 5) {
      setErrorMessage('An artwork can have at most 5 images.')
      return
    }

    try {
      images.forEach((image) => new URL(image))
    } catch {
      setErrorMessage('Each image must be a valid URL.')
      return
    }

    try {
      const payload = {
        ...form,
        title: normalizedTitle,
        price: normalizedPrice,
        images,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
        featured_rank: form.featured_rank === '' ? null : Number(form.featured_rank),
      }

      if (editingId) {
        await updateArtwork(editingId, payload)
        setMessage('Artwork updated successfully.')
      } else {
        await addArtwork(payload)
        setMessage('Artwork added successfully.')
      }

      setForm(initialForm)
      setEditingId(null)
      await Promise.all([loadArtworks(), loadActivityLogs()])
    } catch (error) {
      setErrorMessage(`Failed to save artwork: ${error.message}`)
    }
  }

  const onEditArtwork = (artwork) => {
    const images = Array.isArray(artwork.images) ? artwork.images : []

    setForm({
      image1: images[0] || '',
      image2: images[1] || '',
      image3: images[2] || '',
      image4: images[3] || '',
      image5: images[4] || '',
      title: artwork.title,
      price: String(artwork.price),
      description: artwork.description,
      medium: artwork.medium || '',
      size: artwork.size || '',
      is_featured: artwork.is_featured === true,
      featured_rank: artwork.featured_rank == null ? '' : String(artwork.featured_rank),
      tags: Array.isArray(artwork.tags) ? artwork.tags.join(', ') : '',
      quantity: String(artwork.quantity ?? 1),
      status: artwork.status || 'available',
      category: artwork.category || 'canvas',
    })
    setEditingId(artwork.id)
    setActiveTab('artworks')
    setMessage('')
    setErrorMessage('')
  }

  const onDeleteArtwork = async (id) => {
    if (!window.confirm('Delete this artwork permanently?')) {
      return
    }

    setMessage('')
    setErrorMessage('')
    try {
      await deleteArtwork(id)
      await Promise.all([loadArtworks(), loadActivityLogs()])
      setMessage('Artwork deleted successfully.')
    } catch (error) {
      setErrorMessage(`Failed to delete artwork: ${error.message}`)
    }
  }

  const onSubmitCombo = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!comboForm.title.trim()) {
      setErrorMessage('Combo title is required.')
      return
    }

    if (comboForm.artwork_ids.length < 2 || comboForm.artwork_ids.length > 5) {
      setErrorMessage('Select between 2 and 5 artworks for a combo.')
      return
    }

    try {
      const payload = {
        title: comboForm.title.trim(),
        artwork_ids: comboForm.artwork_ids,
        discount_percent: Number(comboForm.discount_percent),
        is_active: comboForm.is_active,
      }

      if (editingComboId) {
        await updateAdminCombo(editingComboId, payload)
        setMessage('Combo updated successfully.')
      } else {
        await createAdminCombo(payload)
        setMessage('Combo created successfully.')
      }

      setComboForm(initialComboForm)
      setEditingComboId(null)
      await Promise.all([loadCombos(), loadActivityLogs()])
    } catch (error) {
      setErrorMessage(`Failed to save combo: ${error.message}`)
    }
  }

  const onEditCombo = (combo) => {
    setComboForm({
      title: combo.title || '',
      artwork_ids: Array.isArray(combo.artwork_ids) ? combo.artwork_ids.map(Number) : [],
      discount_percent: String(combo.discount_percent || 10),
      is_active: combo.is_active !== false,
    })
    setEditingComboId(combo.id)
    setActiveTab('combos')
  }

  const onDeleteCombo = async (comboId) => {
    if (!window.confirm('Delete this combo permanently?')) {
      return
    }

    setMessage('')
    setErrorMessage('')

    try {
      await deleteAdminCombo(comboId)
      await Promise.all([loadCombos(), loadActivityLogs()])
      setMessage('Combo deleted successfully.')
    } catch (error) {
      setErrorMessage(`Failed to delete combo: ${error.message}`)
    }
  }

  const onToggleComboActive = async (combo) => {
    setMessage('')
    setErrorMessage('')

    try {
      await updateAdminCombo(combo.id, {
        title: combo.title,
        artwork_ids: combo.artwork_ids,
        discount_percent: combo.discount_percent,
        is_active: combo.is_active !== true,
      })
      await Promise.all([loadCombos(), loadActivityLogs()])
      setMessage('Combo status updated.')
    } catch (error) {
      setErrorMessage(`Failed to update combo: ${error.message}`)
    }
  }

  const onChangeTestimonial = (event) => {
    const { name, value, type, checked } = event.target
    setTestimonialForm((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const onSubmitTestimonial = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    try {
      await addTestimonial({
        name: testimonialForm.name.trim(),
        content: testimonialForm.content.trim(),
        rating: testimonialForm.rating ? Number(testimonialForm.rating) : undefined,
        artwork_id: testimonialForm.artwork_id ? Number(testimonialForm.artwork_id) : undefined,
        is_featured: testimonialForm.is_featured,
      })
      setTestimonialForm(initialTestimonialForm)
      await Promise.all([loadTestimonials(), loadActivityLogs()])
      setMessage('Testimonial added successfully.')
    } catch (error) {
      setErrorMessage(`Failed to add testimonial: ${error.message}`)
    }
  }

  const onChangeArtworkStatus = async (id, status) => {
    setMessage('')
    setErrorMessage('')
    try {
      await updateArtworkStatus(id, status)
      await Promise.all([loadArtworks(), loadActivityLogs()])
      setMessage('Artwork status updated.')
    } catch (error) {
      setErrorMessage(`Failed to update status: ${error.message}`)
    }
  }

  const onToggleArtworkFeatured = async (artwork) => {
    setMessage('')
    setErrorMessage('')
    try {
      await updateArtwork(artwork.id, {
        ...artwork,
        images: Array.isArray(artwork.images) ? artwork.images : artwork.image ? [artwork.image] : [],
        is_featured: artwork.is_featured !== true,
      })
      await Promise.all([loadArtworks(), loadDashboardStats(), loadActivityLogs()])
      setMessage('Artwork featured state updated.')
    } catch (error) {
      setErrorMessage(`Failed to update featured state: ${error.message}`)
    }
  }

  const onSuggestArtworkTags = () => {
    const suggestions = getAutoTagSuggestions({
      title: form.title,
      description: form.description,
      medium: form.medium,
      category: form.category,
    })
    const imageSuggestions = getImageTagSuggestions(imageIntelligence, editingId, form.image1)
    const existingTags = form.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
    const nextTags = Array.from(
      new Set([...existingTags, ...suggestions, ...imageSuggestions]),
    )

    setForm((previous) => ({
      ...previous,
      tags: nextTags.join(', '),
    }))
  }

  const onResetRecommendationData = async () => {
    resetTastePreferences()
    setMessage('Recommendation preferences cleared for this browser.')
    try {
      await backendAdminRequest('/api/admin/activity', {
        method: 'POST',
        body: JSON.stringify({
          action_type: 'recommendation_reset',
          resource_type: 'recommendation',
          details: {
            scope: 'local_browser',
          },
        }),
      })
      await loadActivityLogs()
    } catch (error) {
      setErrorMessage(`Preferences were cleared locally, but logging failed: ${error.message}`)
    }
  }

  const onUpdateOrderStatus = async (orderId, paymentStatus) => {
    setMessage('')
    setErrorMessage('')
    try {
      await updateOrderPaymentStatus(orderId, paymentStatus)
      await Promise.all([loadOrders(), loadDashboardStats(), loadActivityLogs()])
      setMessage('Order status updated.')
    } catch (error) {
      setErrorMessage(`Failed to update order: ${error.message}`)
    }
  }

  const onUpdateCommissionStatus = async (commissionId, status) => {
    setMessage('')
    setErrorMessage('')
    try {
      await updateCommissionStatus(commissionId, status)
      await Promise.all([loadCommissions(), loadActivityLogs()])
      setMessage('Commission status updated.')
    } catch (error) {
      setErrorMessage(`Failed to update commission: ${error.message}`)
    }
  }

  const onToggleTestimonialFeatured = async (testimonial) => {
    setMessage('')
    setErrorMessage('')
    try {
      await updateTestimonial(testimonial.id, {
        is_featured: testimonial.is_featured !== true,
      })
      await Promise.all([loadTestimonials(), loadActivityLogs()])
      setMessage('Testimonial featured state updated.')
    } catch (error) {
      setErrorMessage(`Failed to update testimonial: ${error.message}`)
    }
  }

  const onToggleTestimonialVisibility = async (testimonial) => {
    setMessage('')
    setErrorMessage('')
    try {
      await updateTestimonial(testimonial.id, {
        is_visible: testimonial.is_visible !== true,
      })
      await Promise.all([loadTestimonials(), loadActivityLogs()])
      setMessage('Testimonial visibility updated.')
    } catch (error) {
      setErrorMessage(`Failed to update testimonial visibility: ${error.message}`)
    }
  }

  const onChangePasswordField = (event) => {
    const { name, value } = event.target
    setPasswordForm((previous) => ({ ...previous, [name]: value }))
  }

  const onRequestResetToken = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    try {
      const response = await requestAdminPasswordReset(passwordForm.resetEmail.trim())
      setPasswordForm((previous) => ({
        ...previous,
        resetToken: response.data?.resetToken || previous.resetToken,
      }))
      setMessage(response.data?.message || 'Reset token generated.')
    } catch (error) {
      setErrorMessage(`Failed to request reset token: ${error.message}`)
    }
  }

  const onSubmitPasswordReset = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    try {
      const response = await resetAdminPassword(
        passwordForm.resetEmail.trim(),
        passwordForm.resetToken.trim(),
        passwordForm.newPassword,
      )
      setPasswordForm((previous) => ({
        ...previous,
        resetToken: '',
        newPassword: '',
      }))
      setMessage(response.data?.message || 'Password reset successfully.')
    } catch (error) {
      setErrorMessage(`Failed to update password: ${error.message}`)
    }
  }

  const onLogout = async () => {
    await logoutAdmin()
    navigate('/captain')
  }

  const onToggleInquiryRead = async (inquiryId) => {
    const currentValue = inquiryReadState[inquiryId] === true
    setMessage('')
    setErrorMessage('')

    try {
      await backendAdminRequest(`/api/inquiries?id=${Number(inquiryId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_read: !currentValue,
        }),
      })

      setInquiryReadState((previous) => {
        const nextState = {
          ...previous,
          [inquiryId]: !currentValue,
        }
        writeInquiryState(nextState)
        return nextState
      })

      await loadActivityLogs()
      setMessage(`Inquiry marked as ${currentValue ? 'unread' : 'read'}.`)
    } catch (error) {
      setErrorMessage(`Failed to update inquiry: ${error.message}`)
    }
  }

  const filteredArtworks = useMemo(
    () => artworks.filter((artwork) => (artworkFilter === 'all' ? true : artwork.status === artworkFilter)),
    [artworks, artworkFilter],
  )

  const adminArtworkPreviews = useMemo(
    () =>
      new Map(
        filteredArtworks.map((artwork) => [
          artwork.id,
          (Array.isArray(artwork.images) ? artwork.images[0] || '' : '') || artwork.image || '',
        ]),
      ),
    [filteredArtworks],
  )
  const recommendationDebugById = useMemo(() => {
    const tasteProfile = getTasteProfile()
    return new Map(
      filteredArtworks.map((artwork) => [
        artwork.id,
        getRecommendationReason(artwork, tasteProfile),
      ]),
    )
  }, [filteredArtworks])
  const duplicateCandidatesById = useMemo(
    () =>
      new Map(
        filteredArtworks.map((artwork) => [
          artwork.id,
          getDuplicateArtworkMatches(imageIntelligence, artwork.id, 3),
        ]),
      ),
    [filteredArtworks, imageIntelligence],
  )
  const imageIntelligenceById = useMemo(
    () =>
      new Map(
        filteredArtworks.map((artwork) => [
          artwork.id,
          getImageIntelligenceEntryByArtworkId(imageIntelligence, artwork.id),
        ]),
      ),
    [filteredArtworks, imageIntelligence],
  )
  const selectedImageSuggestions = useMemo(
    () => getImageTagSuggestions(imageIntelligence, editingId, form.image1),
    [editingId, form.image1, imageIntelligence],
  )
  const selectedDuplicateCandidates = useMemo(
    () => (editingId ? getDuplicateArtworkMatches(imageIntelligence, editingId, 3) : []),
    [editingId, imageIntelligence],
  )

  const artworksById = Object.fromEntries(artworks.map((artwork) => [artwork.id, artwork]))
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || orders[0] || null
  const selectedArtwork = selectedOrder ? artworksById[selectedOrder.product_id] : null

  if (loading) {
    return <p className="status-message">Loading admin data...</p>
  }

  if (errorMessage && artworks.length === 0 && orders.length === 0) {
    return <p className="status-message error">{errorMessage}</p>
  }

  return (
    <section className="admin-workspace">
      <div className="admin-header">
        <h2 className="section-title">Admin Dashboard</h2>
      </div>

      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
      {message ? <p className="status-message success">{message}</p> : null}

      <div className="admin-layout">
        <AdminSidebar tabs={adminTabs} activeTab={activeTab} onChangeTab={setActiveTab} />

        <div className="admin-content">
          {activeTab === 'dashboard' ? <AdminDashboardTab dashboardStats={dashboardStats} /> : null}
          {activeTab === 'artworks' ? (
            <AdminArtworksTab
              form={form}
              editingId={editingId}
              artworkFilter={artworkFilter}
              filteredArtworks={filteredArtworks}
              adminArtworkPreviews={adminArtworkPreviews}
              recommendationDebugById={recommendationDebugById}
              duplicateCandidatesById={duplicateCandidatesById}
              imageIntelligenceById={imageIntelligenceById}
              selectedImageSuggestions={selectedImageSuggestions}
              selectedDuplicateCandidates={selectedDuplicateCandidates}
              onChange={onChange}
              onToggleFeaturedField={(event) =>
                setForm((previous) => ({ ...previous, is_featured: event.target.checked }))
              }
              onSubmit={onSubmit}
              onCancelEdit={() => {
                setEditingId(null)
                setForm(initialForm)
              }}
              onSetArtworkFilter={setArtworkFilter}
              onChangeArtworkStatus={onChangeArtworkStatus}
              onEditArtwork={onEditArtwork}
              onDeleteArtwork={onDeleteArtwork}
              onToggleArtworkFeatured={onToggleArtworkFeatured}
              onSuggestArtworkTags={onSuggestArtworkTags}
            />
          ) : null}
          {activeTab === 'combos' ? (
            <AdminCombosTab
              comboForm={comboForm}
              editingComboId={editingComboId}
              combos={combos}
              artworks={artworks}
              onChangeComboField={onChangeComboField}
              onToggleComboArtwork={onToggleComboArtwork}
              onSubmitCombo={onSubmitCombo}
              onCancelEditCombo={() => {
                setEditingComboId(null)
                setComboForm(initialComboForm)
              }}
              onEditCombo={onEditCombo}
              onToggleComboActive={onToggleComboActive}
              onDeleteCombo={onDeleteCombo}
            />
          ) : null}
          {activeTab === 'orders' ? (
            <AdminOrdersTab
              orders={orders}
              selectedOrder={selectedOrder}
              selectedArtwork={selectedArtwork}
              orderStatuses={ORDER_STATUSES}
              onSelectOrder={setSelectedOrderId}
              onUpdateOrderStatus={onUpdateOrderStatus}
            />
          ) : null}
          {activeTab === 'testimonials' ? (
            <AdminTestimonialsTab
              testimonialForm={testimonialForm}
              testimonials={testimonials}
              onChangeTestimonial={onChangeTestimonial}
              onSubmitTestimonial={onSubmitTestimonial}
              onToggleTestimonialFeatured={onToggleTestimonialFeatured}
              onToggleTestimonialVisibility={onToggleTestimonialVisibility}
            />
          ) : null}
          {activeTab === 'inquiries' ? (
            <AdminInquiriesTab
              inquiries={inquiries}
              inquiryReadState={inquiryReadState}
              onToggleInquiryRead={onToggleInquiryRead}
            />
          ) : null}
          {activeTab === 'commissions' ? (
            <AdminCommissionsTab
              commissions={commissions}
              onUpdateCommissionStatus={onUpdateCommissionStatus}
            />
          ) : null}
          {activeTab === 'settings' ? (
            <AdminSettingsTab
              adminSession={adminSession}
              activityLogs={activityLogs}
              resetEmail={passwordForm.resetEmail}
              resetToken={passwordForm.resetToken}
              newPassword={passwordForm.newPassword}
              onChangePasswordField={onChangePasswordField}
              onRequestResetToken={onRequestResetToken}
              onSubmitPasswordReset={onSubmitPasswordReset}
              onLogout={onLogout}
              onResetRecommendationData={onResetRecommendationData}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default Admin
