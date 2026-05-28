import { useState } from 'react'
import Reveal from '../components/Reveal'
import usePageMeta from '../hooks/usePageMeta'

function Contact() {
  usePageMeta({
    title: 'Contact | Archiverse',
    description: 'Connect with Archiverse for artwork inquiries and support.',
  })

  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setStatus({ type: '', message: '' })
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const text = await response.text()
      const payload = text ? JSON.parse(text) : null
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || 'Unable to send inquiry.')
      }

      setStatus({ type: 'success', message: 'INQUIRY SENT.' })
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (error) {
      setStatus({ type: 'error', message: String(error.message || 'Unable to send inquiry.') })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-flow page-with-header-gap">
      <Reveal className="contact-layout contact-page-layout">
        <div className="contact-copy">
          <p className="eyebrow">CONTACT</p>
          <p className="section-copy">
            FOR CUSTOM PAINTINGS, COMMISSIONS, OR INQUIRIES
          </p>
          <div className="contact-links">
            <a href="https://www.instagram.com/__archiverse_/" target="_blank" rel="noreferrer">
              INSTAGRAM
            </a>
            <a href="mailto:archikri07@gmail.com">MAIL</a>
            <a
              href="https://www.linkedin.com/in/archi-kumari-6a3489371/"
              target="_blank"
              rel="noreferrer"
            >
              LINKEDIN
            </a>
          </div>
        </div>

        <form className="contact-form" onSubmit={onSubmit}>
          <label>
            NAME
            <input
              type="text"
              name="name"
              placeholder="Your name"
              value={form.name}
              onChange={onChange}
              required
            />
          </label>
          <label>
            EMAIL
            <input
              type="email"
              name="email"
              placeholder="Your email"
              value={form.email}
              onChange={onChange}
              required
            />
          </label>
          <label>
            SUBJECT
            <input
              type="text"
              name="subject"
              placeholder="Custom painting / inquiry / message"
              value={form.subject}
              onChange={onChange}
              required
            />
          </label>
          <label>
            MESSAGE
            <textarea
              name="message"
              placeholder="Tell me about the work you have in mind."
              value={form.message}
              onChange={onChange}
              required
            />
          </label>
          <button type="submit" className="text-link-button action-button">
            {isSubmitting ? 'SENDING…' : 'SEND INQUIRY'}
          </button>
          {status.message ? (
            <p className={`status-message ${status.type}`.trim()}>{status.message}</p>
          ) : null}
        </form>
      </Reveal>

      <Reveal className="developer-section">
        <div className="contact-copy developer-copy">
          <p className="eyebrow">SITE & DEVELOPMENT</p>
          <p className="section-copy">DESIGNED & DEVELOPED BY ANIMESH</p>
          <div className="contact-links developer-links">
            <a href="https://github.com/CaptainAni187" target="_blank" rel="noreferrer">
              GITHUB
            </a>
            <a href="mailto:kanimesh187@gmail.com">MAIL</a>
            <a
              href="https://www.linkedin.com/in/animesh-kumar-5347b4294/"
              target="_blank"
              rel="noreferrer"
            >
              LINKEDIN
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export default Contact
