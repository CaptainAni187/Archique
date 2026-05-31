import usePageMeta from '../hooks/usePageMeta'

function Privacy() {
  usePageMeta({
    title: 'Privacy & Personalization | Archiverse',
    description: 'How Archiverse uses analytics and recommendation data.',
  })

  return (
    <section className="info-page">
      <p className="eyebrow">PRIVACY & PERSONALIZATION</p>
      <h1 className="section-title">How your data shapes curation</h1>
      <p>
        Archiverse uses event analytics to improve recommendation quality. We track interactions such
        as views, clicks, saves, searches, and checkout actions.
      </p>
      <p>
        Personalization is deterministic. We do not run autonomous model training on personal
        identity data. Taste vectors are updated through weighted rules in our local recommendation
        pipeline.
      </p>
      <p>
        Google login is handled through Supabase Auth for identity verification only. Your Archiverse
        account, saved artworks, profile settings, and recommendation profile remain in Archiverse
        backend tables.
      </p>
      <p>
        You can export your data or delete your account from Account Settings. Digest emails are
        opt-in and rate-limited.
      </p>
      <p>
        We retain recommendation events to improve cross-session continuity, then use retention windows
        for operational cleanup.
      </p>
    </section>
  )
}

export default Privacy
