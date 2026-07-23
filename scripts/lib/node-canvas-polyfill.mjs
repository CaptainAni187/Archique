// Minimal shim so three.js's GLTFExporter/USDZExporter (written for browsers)
// can run in a plain Node script. They only ever need to draw an already-loaded
// image onto a canvas and read the pixels back out — @napi-rs/canvas covers
// exactly that surface.
import { Canvas, Image, ImageData } from '@napi-rs/canvas'

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return new Canvas(1, 1)
      }
      throw new Error(`node-canvas-polyfill: unsupported element "${tag}"`)
    },
  }
}

if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = Image
}

// three's exporters gate their `instanceof` checks on these browser globals
// existing at all — without an alias, a real @napi-rs Canvas/Image never
// matches and every texture is treated as "no valid image data".
if (typeof globalThis.HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = Canvas
}
if (typeof globalThis.HTMLImageElement === 'undefined') {
  globalThis.HTMLImageElement = Image
}

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = ImageData
}

// Node has a native Blob (with .arrayBuffer()) but no FileReader — the
// exporters only ever use readAsArrayBuffer/readAsDataURL, so a thin wrapper
// over Blob is enough.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer
          this.onloadend?.()
        })
        .catch((error) => this.onerror?.(error))
    }

    readAsDataURL(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          const base64 = Buffer.from(buffer).toString('base64')
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`
          this.onloadend?.()
        })
        .catch((error) => this.onerror?.(error))
    }
  }
}
