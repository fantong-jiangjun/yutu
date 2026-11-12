const fs = wx.getFileSystemManager()

const DEFAULT_QUALITY = 0.92
const MIN_QUALITY = 0.45
/** PDF 体积上限（字节） */
const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_PDF_MB = 10
const MAX_PAGES = 30
const MAX_CANVAS_SIDE = 4096
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024

function sanitizePdfBaseName(name) {
  const trimmed = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40)
  return trimmed || '图片'
}

function toPdfFileName(name) {
  const base = sanitizePdfBaseName(name)
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function strToUint8(str) {
  const arr = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff
  return arr
}

function concatParts(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function getImageDimensions(path) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src: path, success: resolve, fail: reject })
  })
}

function fitCanvasDimensions(width, height) {
  const sideScale = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height))
  const pixelScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)))
  const scale = Math.min(sideScale, pixelScale)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: scale < 1
  }
}

function loadCanvasImage(canvas, srcPath) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = srcPath
  })
}

function isValidJpeg(data) {
  return data.length > 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
}

function estimatePageJpegBytes(width, height, quality) {
  const factor = 0.12 + quality * 0.22
  return Math.ceil(width * height * factor)
}

function lowerQuality(quality) {
  return Math.max(MIN_QUALITY, Math.round((quality - 0.08) * 100) / 100)
}

/** 预估总体积，并记录是否因 Canvas 安全边界缩小了超大原图 */
async function planCompression(imagePaths) {
  let quality = DEFAULT_QUALITY
  const dims = []
  let resized = false

  for (const path of imagePaths) {
    const info = await getImageDimensions(path)
    const fitted = fitCanvasDimensions(info.width, info.height)
    dims.push(fitted)
    if (fitted.resized) resized = true
  }

  const overhead = imagePaths.length * 600 + 2048

  for (let round = 0; round < 12; round++) {
    let estimate = overhead
    for (const dim of dims) {
      estimate += estimatePageJpegBytes(dim.width, dim.height, quality)
    }
    if (estimate <= MAX_PDF_BYTES) {
      return { quality, autoCompressed: quality < DEFAULT_QUALITY || resized }
    }
    if (quality <= MIN_QUALITY) break
    quality = lowerQuality(quality)
  }

  return { quality: MIN_QUALITY, autoCompressed: true }
}

function currentOffset(bodyParts) {
  return bodyParts.reduce((s, p) => s + p.length, 0)
}

function writeObject(bodyParts, offsets, objectId, chunks) {
  offsets[objectId] = currentOffset(bodyParts)
  for (const chunk of chunks) bodyParts.push(chunk)
}

function writeStreamObject(bodyParts, offsets, objectId, streamBytes, dictEntries) {
  const dict = dictEntries
    ? `<< ${dictEntries} /Length ${streamBytes.length} >>`
    : `<< /Length ${streamBytes.length} >>`
  writeObject(bodyParts, offsets, objectId, [
    strToUint8(`${objectId} 0 obj\n${dict}\nstream\n`),
    streamBytes,
    strToUint8('\nendstream\nendobj\n')
  ])
}

function exportCanvasJpeg(canvas, width, height, quality, component) {
  return new Promise((resolve, reject) => {
    const opts = {
      canvas,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'jpg',
      quality,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(err || new Error('图片导出失败'))
    }
    if (component) {
      wx.canvasToTempFilePath(opts, component)
    } else {
      wx.canvasToTempFilePath(opts)
    }
  })
}

function readFileBuffer(path) {
  return new Promise((resolve, reject) => {
    fs.readFile({
      filePath: path,
      success: (res) => resolve(new Uint8Array(res.data)),
      fail: reject
    })
  })
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 16))
}

/** 保持原图比例；超出 Canvas 安全边界时等比缩小 */
async function convertPageToJpeg(canvas, srcPath, component, quality) {
  const info = await getImageDimensions(srcPath)
  const { width, height } = fitCanvasDimensions(info.width, info.height)
  const ctx = canvas.getContext('2d')
  canvas.width = width
  canvas.height = height
  const img = await loadCanvasImage(canvas, srcPath)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const tempPath = await exportCanvasJpeg(canvas, width, height, quality, component)
  const jpegData = await readFileBuffer(tempPath)
  if (!isValidJpeg(jpegData)) {
    throw new Error('图片转换失败，请换一张重试')
  }
  return { width, height, jpegData }
}

async function convertPageWithinBudget(canvas, srcPath, component, quality, budgetBytes) {
  let currentQuality = quality
  let page = await convertPageToJpeg(canvas, srcPath, component, currentQuality)
  let attempts = 0

  while (page.jpegData.length > budgetBytes && currentQuality > MIN_QUALITY && attempts < 10) {
    currentQuality = lowerQuality(currentQuality)
    page = await convertPageToJpeg(canvas, srcPath, component, currentQuality)
    attempts++
  }

  return {
    page,
    quality: currentQuality,
    autoCompressed: currentQuality < DEFAULT_QUALITY
  }
}

/**
 * 多张图片合并为一个 PDF，保持原图比例。
 * 超大图片按 Canvas 安全边界缩小，预计超限时降低 JPEG 画质。
 */
async function createPdfFromImages(imagePaths, canvas, component, onProgress, fileName) {
  if (!imagePaths || !imagePaths.length) {
    throw new Error('请至少选择一张图片')
  }
  if (imagePaths.length > MAX_PAGES) {
    throw new Error(`单次最多合成 ${MAX_PAGES} 张，当前 ${imagePaths.length} 张，请分批处理`)
  }
  if (!canvas) {
    throw new Error('Canvas 初始化失败')
  }

  const pageCount = imagePaths.length
  let { quality, autoCompressed } = await planCompression(imagePaths)
  let totalJpegBytes = 0
  const jpegBudget = MAX_PDF_BYTES * 0.9

  const catalogId = 1
  const pagesRootId = 2
  const objectsPerPage = 3
  const firstPageId = 3
  const objectCount = firstPageId + pageCount * objectsPerPage - 1
  const offsets = new Array(objectCount + 1).fill(0)
  offsets[0] = 0

  const bodyParts = [strToUint8('%PDF-1.4\n')]

  writeObject(bodyParts, offsets, catalogId, [
    strToUint8(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesRootId} 0 R >>\nendobj\n`)
  ])

  const pageObjectIds = []
  for (let i = 0; i < pageCount; i++) {
    pageObjectIds.push(firstPageId + i * objectsPerPage)
  }
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ')
  writeObject(bodyParts, offsets, pagesRootId, [
    strToUint8(`${pagesRootId} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`)
  ])

  for (let i = 0; i < pageCount; i++) {
    if (onProgress) onProgress(i + 1, pageCount)

    const remaining = pageCount - i
    const remainingBudget = Math.max(
      jpegBudget - totalJpegBytes,
      Math.floor(jpegBudget / pageCount * 0.5)
    )
    const pageBudget = Math.floor(remainingBudget / remaining)

    const converted = await convertPageWithinBudget(
      canvas,
      imagePaths[i],
      component,
      quality,
      pageBudget
    )
    quality = converted.quality
    if (converted.autoCompressed) autoCompressed = true

    const { width, height, jpegData } = converted.page
    totalJpegBytes += jpegData.length

    const pageId = firstPageId + i * objectsPerPage
    const imageId = pageId + 1
    const contentId = pageId + 2

    writeObject(bodyParts, offsets, pageId, [
      strToUint8(
        `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contentId} 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> >> >>\nendobj\n`
      )
    ])

    writeStreamObject(
      bodyParts,
      offsets,
      imageId,
      jpegData,
      `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`
    )

    const contentBytes = strToUint8(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`)
    writeStreamObject(bodyParts, offsets, contentId, contentBytes)

    await yieldToMain()
  }

  const xrefOffset = currentOffset(bodyParts)
  const xrefLines = [`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`]
  for (let id = 1; id <= objectCount; id++) {
    xrefLines.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  bodyParts.push(strToUint8(xrefLines.join('')))
  bodyParts.push(strToUint8(
    `trailer\n<< /Size ${objectCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  ))

  const pdfBytes = concatParts(bodyParts)
  if (pdfBytes.length > MAX_PDF_BYTES) {
    throw new Error(`图片内容过大，最低画质仍超过 ${MAX_PDF_MB}MB，请减少图片数量后重试`)
  }

  const pdfFileName = toPdfFileName(fileName)
  const outPath = `${wx.env.USER_DATA_PATH}/${sanitizePdfBaseName(fileName)}_${Date.now()}.pdf`
  const arrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  )

  await new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: outPath,
      data: arrayBuffer,
      success: resolve,
      fail: () => {
        fs.writeFile({
          filePath: outPath,
          data: wx.arrayBufferToBase64(arrayBuffer),
          encoding: 'base64',
          success: resolve,
          fail: reject
        })
      }
    })
  })

  return {
    path: outPath,
    fileName: pdfFileName,
    autoCompressed,
    sizeBytes: pdfBytes.length
  }
}

module.exports = {
  createPdfFromImages,
  MAX_PAGES,
  MAX_PDF_MB,
  sanitizePdfBaseName,
  toPdfFileName
}
