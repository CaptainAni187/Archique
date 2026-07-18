import fs from 'node:fs/promises'
import formidable from 'formidable'
import { requireAdminAuth } from './_lib/adminSession.js'
import { methodNotAllowed, sendJson } from './_lib/http.js'
import { uploadArtworkImageFile } from './_lib/supabaseStorage.js'

// The client-supplied mimetype is trivially spoofable, so verify the actual
// file signature (magic bytes) before anything is stored.
function matchesImageSignature(buffer) {
  if (!buffer || buffer.length < 12) {
    return false
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  const isGif = buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  // HEIC/AVIF and friends use an ISO-BMFF "ftyp" box at offset 4.
  const isIsoBmffImage = buffer.subarray(4, 8).toString('ascii') === 'ftyp'

  return isJpeg || isPng || isGif || isWebp || isIsoBmffImage
}

async function hasImageContent(file) {
  if (!file?.filepath) {
    return false
  }

  let handle = null
  try {
    handle = await fs.open(file.filepath, 'r')
    const buffer = Buffer.alloc(12)
    const { bytesRead } = await handle.read(buffer, 0, 12, 0)
    return matchesImageSignature(buffer.subarray(0, bytesRead))
  } catch {
    return false
  } finally {
    await handle?.close().catch(() => null)
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}

function parseMultipartForm(req) {
  const form = formidable({
    multiples: true,
    maxFiles: 5,
    maxFileSize: 10 * 1024 * 1024,
    keepExtensions: true,
  })

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error)
        return
      }

      resolve({ fields, files })
    })
  })
}

function getImageFiles(files) {
  const candidates = files.images || files.files || []
  const list = Array.isArray(candidates) ? candidates : [candidates]

  return list.filter((file) => file && typeof file === 'object')
}

async function buildUploadedImagesResponse(imageFiles, uploader = uploadArtworkImageFile) {
  return Promise.all(
    imageFiles.map(async (file, index) => {
      const uploaded = await uploader(file)
      return {
        url: uploaded.url,
        is_primary: index === 0,
      }
    }),
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const session = await requireAdminAuth(req, res)
    if (!session) {
      return null
    }

    const { files } = await parseMultipartForm(req)
    const imageFiles = getImageFiles(files)

    if (imageFiles.length < 1 || imageFiles.length > 5) {
      return sendJson(res, 400, {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Images must contain between 1 and 5 files.',
        details: [
          {
            path: 'images',
            message: 'Images must contain between 1 and 5 files.',
            code: 'custom',
          },
        ],
      })
    }

    const signatureChecks = await Promise.all(imageFiles.map((file) => hasImageContent(file)))
    const invalidFile = imageFiles.find(
      (file, index) =>
        typeof file.mimetype !== 'string' ||
        !file.mimetype.startsWith('image/') ||
        !signatureChecks[index],
    )

    if (invalidFile) {
      return sendJson(res, 400, {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Only image files are allowed.',
        details: [
          {
            path: 'images',
            message: 'Only image files are allowed.',
            code: 'custom',
          },
        ],
      })
    }

    const uploadedImages = await buildUploadedImagesResponse(imageFiles)

    return sendJson(res, 200, {
      success: true,
      images: uploadedImages,
      data: {
        images: uploadedImages,
      },
    })
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'UPLOAD_REQUEST_FAILED',
      message: error.message || 'Unable to upload artwork images.',
    })
  }
}
