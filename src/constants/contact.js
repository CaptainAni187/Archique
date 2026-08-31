// The only email address that may appear anywhere in the interface.
//
// It is a forwarding alias, so the studio's personal inbox stays private —
// which is the whole point of routing through it. Kept in one place because
// the address was previously hardcoded in three files and a personal address
// leaked into two of them.
export const PUBLIC_EMAIL = 'archi@archique.in'
export const PUBLIC_EMAIL_HREF = `mailto:${PUBLIC_EMAIL}`

/** Studio contact details, used on the site, in email, and on documents. */
export const STUDIO = {
  phone: '+91 87970 92998',
  phoneHref: 'tel:+918797092998',
  email: PUBLIC_EMAIL,
  instagram: 'https://www.instagram.com/archique.in/',
  instagramHandle: '@archique.in',
  city: 'Ranchi, Jharkhand, India',
}
