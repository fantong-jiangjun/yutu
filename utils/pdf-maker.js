const fs = wx.getFileSystemManager()
const MAX_SIDE = 4096

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

function readFileBuffer(path) {
  return new Promise((resolve, reject) => {
    fs.readFile({
      filePath: path,
      success: (res) => resolve(new Uint8Array(res.data)),
      fail: reject
    })
  })
}

function getImageDimensions(path) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src: path, success: resolve, fail: reject })
  })
}

function loadCanvasImage(canvas, srcPath) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = srcPath
  })
}

function fitDimensions(width, height) {
  const max = Math.max(width, height)
  if (max <= MAX_SIDE) return { width, height }
  const scale = MAX_SIDE / max
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

function exportCanvasJpeg(canvas, width, height) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'jpg',
      quality: 0.92,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    })
  })
}

/** 统一经 canvas 转成标准 RGB JPEG，避免原图格式/色彩空间导致 PDF 预览空白 */
async function convertToJpeg(canvas, srcPath) {
  const info = await getImageDimensions(srcPath)
  const { width, height } = fitDimensions(info.width, info.height)
  const ctx = canvas.getContext('2d')
  canvas.width = width
  canvas.height = height
  const img = await loadCanvasImage(canvas, srcPath)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const tempPath = await exportCanvasJpeg(canvas, width, height)
  const jpegData = await readFileBuffer(tempPath)
  if (!jpegData.length) throw new Error('图片转换失败')
  return { width, height, jpegData }
}

/** 多张图片合并为一个 PDF，每页一张图 */
async function createPdfFromImages(imagePaths, canvas) {
  if (!imagePaths || !imagePaths.length) {
    throw new Error('请至少选择一张图片')
  }
  if (!canvas) {
    throw new Error('Canvas 初始化失败')
  }

  const pages = []
  for (const path of imagePaths) {
    pages.push(await convertToJpeg(canvas, path))
  }

  const pageIds = []
  const imageIds = []
  const contentIds = []
  let nextId = 3
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(nextId++)
    imageIds.push(nextId++)
    contentIds.push(nextId++)
  }

  const catalogId = 1
  const pagesRootId = 2
  const bodyParts = [strToUint8('%PDF-1.4\n')]
  const offsets = [0]

  const recordOffset = () => {
    offsets.push(bodyParts.reduce((s, p) => s + p.length, 0))
  }

  recordOffset()
  bodyParts.push(strToUint8(
    `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesRootId} 0 R >>\nendobj\n`
  ))

  recordOffset()
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ')
  bodyParts.push(strToUint8(
    `${pagesRootId} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`
  ))

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    const w = p.width
    const h = p.height
    const pageId = pageIds[i]
    const imgId = imageIds[i]
    const contentId = contentIds[i]
    const contentStream = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`

    recordOffset()
    bodyParts.push(strToUint8(
      `${contentId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`
    ))

    recordOffset()
    bodyParts.push(strToUint8(
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentId} 0 R /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> >>\nendobj\n`
    ))

    recordOffset()
    bodyParts.push(strToUint8(
      `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /Filter /DCTDecode /Length ${p.jpegData.length} >>\nstream\n`
    ))
    bodyParts.push(p.jpegData)
    bodyParts.push(strToUint8('\nendstream\nendobj\n'))
  }

  const xrefOffset = bodyParts.reduce((s, p) => s + p.length, 0)
  const xrefLines = [`xref\n0 ${offsets.length}\n0000000000 65535 f \n`]
  for (let i = 1; i < offsets.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  bodyParts.push(strToUint8(xrefLines.join('')))
  bodyParts.push(strToUint8(`trailer\n<< /Size ${offsets.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`))

  const pdfBytes = concatParts(bodyParts)
  const outPath = `${wx.env.USER_DATA_PATH}/images_${Date.now()}.pdf`
  const buffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  )

  await new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: outPath,
      data: buffer,
      success: resolve,
      fail: reject
    })
  })

  return outPath
}

module.exports = {
  createPdfFromImages
}
