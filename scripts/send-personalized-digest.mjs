function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = required('SUPABASE_URL')
  const serviceRole = required('SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || `Supabase request failed: ${response.status}`)
  }
  return payload
}

async function sendEmail({ to, subject, html }) {
  const resendApiKey = required('RESEND_API_KEY')
  const fromEmail = required('FROM_EMAIL')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
    }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.message || 'Failed to send digest email.')
  }
}

async function main() {
  const users = await supabaseRequest(
    "user_accounts?select=id,name,email,digest_frequency,digest_last_sent_at&digest_opt_in=eq.true&deleted_at=is.null&order=id.asc",
  )

  const artworks = await supabaseRequest(
    'artworks?select=id,title,category,tags,price,images,is_featured,featured_rank&order=created_at.desc&limit=80',
  )

  for (const user of users) {
    const picks = artworks
      .filter((artwork) => artwork.is_featured === true)
      .slice(0, 4)
      .map((artwork) => `<li>${artwork.title} — ${artwork.category || 'artwork'}</li>`)
      .join('')

    if (!picks) {
      continue
    }

    await sendEmail({
      to: user.email,
      subject: 'Your Archiverse curated digest',
      html: `
        <h2>Curated for you</h2>
        <p>Hello ${String(user.name || 'Collector').replaceAll('<', '&lt;')}</p>
        <p>New works aligned to your Archiverse profile:</p>
        <ul>${picks}</ul>
        <p>Manage preferences in your account settings.</p>
      `,
    })

    await supabaseRequest(`user_accounts?id=eq.${Number(user.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ digest_last_sent_at: new Date().toISOString() }),
    })
  }

  console.log(`Digest sent to ${users.length} opted-in users.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
