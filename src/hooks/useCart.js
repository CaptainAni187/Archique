import { useSyncExternalStore } from 'react'
import { getCartItems, subscribeToCart } from '../state/cartStore'

const EMPTY = []

/**
 * Subscribe to the cart store. Every consumer re-renders together whenever the
 * cart changes — including changes made in another browser tab.
 */
export default function useCart() {
  return useSyncExternalStore(subscribeToCart, getCartItems, () => EMPTY)
}
