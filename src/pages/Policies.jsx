import Reveal from '../components/Reveal'
import usePageMeta from '../hooks/usePageMeta'

const SECTIONS = [
  {
    id: 'reserving',
    label: 'RESERVING A WORK',
    paragraphs: [
      'Every piece in Archiverse is an original. There is only ever one.',
      'A work is reserved for you the moment payment is received in full. From that point it leaves the collection, is marked unavailable to everyone else, and begins its preparation for you. We ask for full payment upfront rather than a partial advance so that a reservation is a genuine commitment on both sides — the piece is truly yours from that moment, not held on a promise.',
    ],
  },
  {
    id: 'payment',
    label: 'PAYMENT',
    paragraphs: [
      'Payments are handled by Razorpay over an encrypted connection.',
      'Archiverse never sees or stores your card, UPI, or banking details. Every payment is verified against the payment provider before an order is confirmed, and you receive an order code you can use to follow the piece at any time. Valid coupon codes are applied at checkout before payment, and shipping is calculated and shown before you pay — there are no hidden charges added afterward.',
    ],
  },
  {
    id: 'preparation',
    label: 'PREPARATION & DISPATCH',
    paragraphs: [
      'Original work is finished, cured, and packed by hand — not pulled from a shelf.',
      'Ready pieces are dispatched within 4–7 business days of payment clearing. Commissioned work follows the timeline agreed with you directly. If anything needs longer — a varnish that has not fully cured, a frame that has not arrived — you will hear it from us before the date passes, not after.',
    ],
  },
  {
    id: 'delivery',
    label: 'DELIVERY',
    paragraphs: [
      'Each work travels wrapped in glassine, corner-protected, and boxed rigid.',
      'Delivery timelines vary by destination and are shared with your tracking details at dispatch. Please open and inspect the piece in front of the delivery partner where possible — it makes any claim far simpler to resolve.',
    ],
  },
  {
    id: 'cancellation',
    label: 'CANCELLATION',
    paragraphs: [
      'Plans change, and that is understood.',
      'An order may be cancelled for a full refund at any point before dispatch. Once a work has been dispatched it cannot be cancelled, because the piece has already left the studio and been withdrawn from the collection.',
    ],
  },
  {
    id: 'damage',
    label: 'IF SOMETHING ARRIVES WRONG',
    paragraphs: [
      'Rare, but it matters more than anything else on this page.',
      'If a work arrives damaged, or is not the piece you ordered, tell us within 48 hours of delivery with photographs of the packaging and the work. Verified damage or fulfilment errors are resolved by repair, replacement where the piece allows it, or a full refund. Return shipping in these cases is never your cost.',
    ],
  },
  {
    id: 'returns',
    label: 'CHANGE OF MIND',
    paragraphs: [
      'Because every work is one of one and finished by hand, pieces are not returnable simply for a change of mind once delivered.',
      'Colour and texture can also read differently between a screen and a wall. If you are unsure how a piece will sit in your space, use "See It On Your Wall" to preview it at real size before you order, or write to us — an honest answer beforehand is better for both of us than a return afterwards.',
    ],
  },
  {
    id: 'commissions',
    label: 'COMMISSIONS',
    paragraphs: [
      'Commissioned work follows the same full-payment-upfront structure as the rest of the collection.',
      'Payment covers materials and studio time and becomes non-refundable once painting has begun, as the work is made specifically for you and cannot return to the collection. Scope, size, and timeline are confirmed in writing before any brush is lifted.',
    ],
  },
  {
    id: 'care',
    label: 'CARING FOR YOUR PIECE',
    paragraphs: [
      'Keep the work out of direct sunlight and away from damp walls or steam.',
      'Dust gently with a dry, soft cloth — never a wet one, and never a cleaning product. Treated this way, acrylic on canvas will outlive all of us.',
    ],
  },
  {
    id: 'questions',
    label: 'QUESTIONS',
    paragraphs: ['If anything here is unclear, ask before you order rather than after:'],
    email: 'archikri07@gmail.com',
  },
]

function Policies() {
  usePageMeta({
    title: 'Policies | Archiverse',
    description:
      'How Archiverse handles reservations, payment, dispatch, delivery, cancellations, and damage.',
  })

  return (
    <section className="page-flow page-with-header-gap privacy-page">
      <Reveal className="privacy-editorial">
        <header className="privacy-header">
          <h1 className="section-title">POLICIES</h1>
          <p className="privacy-subtitle">
            A transparent process, from reservation to the wall it lives on.
          </p>
          <p className="privacy-body">
            Buying an original is not the same as buying a print. There is one of each piece, it is
            finished by hand, and it travels a long way to reach you. Everything below exists so you
            know exactly what happens after you place an order — what you pay, when it ships, and
            what we do on the rare occasion something goes wrong.
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

export default Policies
