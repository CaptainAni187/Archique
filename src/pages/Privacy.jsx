import Reveal from '../components/Reveal'
import usePageMeta from '../hooks/usePageMeta'

const SECTIONS = [
  {
    id: 'remember',
    label: 'WHAT WE REMEMBER',
    paragraphs: [
      'To make your gallery feel uniquely yours, we may securely store:',
    ],
    list: [
      'Your name and email address, so your account and orders belong to you',
      'Your phone number and delivery address — street, city, state, and pincode — used to ship your work and to prefill checkout so you never retype them',
      'Saved artworks, wishlists, and personal collections',
      'Order history, including what you bought and where it was sent',
      'Activity such as searches, views, clicks, and purchases',
    ],
    closing:
      'Delivery details are stored only because a courier needs them and because retyping an address at every purchase is a poor experience. You can view, correct, export, or permanently delete all of it from your account at any time. Nothing is collected without purpose, and nothing is gathered beyond what helps improve your experience.',
  },
  {
    id: 'curated',
    label: 'CURATED FOR YOU',
    paragraphs: [
      'Every recommendation is shaped by your own journey, not by generic trends.',
      'The artworks you explore, the collections you save, and the spaces you share help Archique surface pieces that better reflect your aesthetic. Your personal information is never sold, rented, or shared with advertisers, and it is never used to train public AI models.',
    ],
  },
  {
    id: 'ai',
    label: 'AI AS A QUIET CURATOR',
    paragraphs: [
      'Artificial intelligence within Archique is designed to assist discovery—not replace human taste.',
      'It helps organize artworks, refine search, understand visual styles, and personalize recommendations. Every suggestion is meant to inspire exploration, while every decision remains entirely yours.',
    ],
  },
  {
    id: 'ar',
    label: 'SEE IT ON YOUR WALL',
    paragraphs: [
      'You can preview a piece at its true size on your own wall using your phone camera, straight from the artwork page.',
      'This augmented-reality view runs entirely on your device through your phone’s built-in AR viewer. Your camera feed is never uploaded, recorded, or seen by Archique—we only send the artwork model to your device, and nothing about your room comes back to us.',
    ],
  },
  {
    id: 'purchases',
    label: 'SECURE PURCHASES',
    paragraphs: [
      'Purchases are processed through trusted and encrypted payment providers.',
      'Payments are handled by Razorpay. Your card, UPI, and banking details are entered on their systems and are never seen, transmitted, or stored by Archique — we receive only a payment reference used to confirm your order. To deliver your work, your name, phone number, and delivery address are shared with our courier partner, and with nobody else. Passwords are stored only as irreversible hashes, and administrative access to order data is restricted and logged.',
    ],
  },
  {
    id: 'choices',
    label: 'YOUR CHOICES',
    paragraphs: ['You remain in complete control of your experience.', 'At any time, you can:'],
    list: [
      'Update or correct your delivery details from your account page',
      'Update or permanently delete your account',
      'Manage your wishlist and saved collections',
      'Adjust personalization and email preferences, including opting out of emails entirely',
      'Download a copy of everything we hold about you as a file',
      'Contact us with any privacy-related question',
    ],
    closing: 'Your information belongs to you. It always will.',
  },
  {
    id: 'philosophy',
    label: 'OUR PHILOSOPHY',
    paragraphs: [
      'Technology should quietly support the experience of discovering art, never become the center of it.',
      'Every feature—from personalized recommendations to previewing a piece on your own wall—is built to help you find artwork that feels at home in your space, while treating your privacy with the same care and respect given to every piece in the collection.',
    ],
  },
  {
    id: 'contact',
    label: 'CONTACT',
    paragraphs: [
      'For questions about your privacy, your account, or your data:',
    ],
    email: 'archikri07@gmail.com',
  },
]

function Privacy() {
  usePageMeta({
    title: 'Your Privacy | Archique',
    description:
      'How Archique handles your data with care—personalization, room profiles, and your choices.',
  })

  return (
    <section className="page-flow page-with-header-gap privacy-page">
      <Reveal className="privacy-editorial">
        <header className="privacy-header">
          <h1 className="section-title">YOUR PRIVACY</h1>
          <p className="privacy-subtitle">Art is deeply personal. Your privacy should be, too.</p>
          <p className="privacy-body">
            Every collection begins with curiosity. Archique quietly remembers the pieces you
            admire, the collections you create, and the spaces you choose to share—not to follow you
            across the digital world, but to make every visit feel more familiar. The information you
            share exists solely to create a more thoughtful and personal experience within
            Archique.
          </p>
        </header>

        {SECTIONS.map((section) => (
          <article key={section.id} className="privacy-section">
            <p className="eyebrow">{section.label}</p>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="privacy-body">
                {paragraph}
              </p>
            ))}
            {section.list ? (
              <ul className="privacy-list">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.closing ? <p className="privacy-body">{section.closing}</p> : null}
            {section.email ? (
              <a href={`mailto:${section.email}`} className="privacy-contact-email">
                {section.email}
              </a>
            ) : null}
          </article>
        ))}
      </Reveal>
    </section>
  )
}

export default Privacy
