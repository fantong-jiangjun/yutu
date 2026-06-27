function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function calcCropRect(srcW, srcH, aspectRatio, offsetX = 0.5, offsetY = 0.5) {
  const srcRatio = srcW / srcH
  let cropW, cropH, cropX, cropY

  if (srcRatio > aspectRatio) {
    cropH = srcH
    cropW = Math.round(srcH * aspectRatio)
    cropX = Math.round((srcW - cropW) * offsetX)
    cropY = 0
  } else {
    cropW = srcW
    cropH = Math.round(srcW / aspectRatio)
    cropX = 0
    cropY = Math.round((srcH - cropH) * offsetY)
  }

  cropX = Math.max(0, Math.min(cropX, srcW - cropW))
  cropY = Math.max(0, Math.min(cropY, srcH - cropH))

  return { cropX, cropY, cropW, cropH }
}

function exportCanvas(canvas, fileType = 'jpg', quality = 0.92, destWidth, destHeight) {
  return new Promise((resolve, reject) => {
    const opts = {
      canvas,
      fileType,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    }
    if (fileType === 'jpg') opts.quality = quality
    if (destWidth && destHeight) {
      opts.destWidth = destWidth
      opts.destHeight = destHeight
    }
    wx.canvasToTempFilePath(opts)
  })
}

function getImageSize(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject })
  })
}

function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: reject
    })
  })
}

/**
 * 整图适配：完整缩放进目标框，不裁剪，不足处白边补齐
 */
function calcFitRect(srcW, srcH, targetW, targetH) {
  const srcRatio = srcW / srcH
  const targetRatio = targetW / targetH
  let drawW, drawH, offsetX, offsetY

  if (srcRatio > targetRatio) {
    drawW = targetW
    drawH = targetW / srcRatio
    offsetX = 0
    offsetY = (targetH - drawH) / 2
  } else {
    drawH = targetH
    drawW = targetH * srcRatio
    offsetX = (targetW - drawW) / 2
    offsetY = 0
  }

  return {
    drawW: Math.round(drawW),
    drawH: Math.round(drawH),
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY)
  }
}

function drawToCanvas(ctx, img, targetW, targetH, fitMode, cropOffsetX, cropOffsetY) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetW, targetH)

  if (fitMode === 'cover') {
    const { cropX, cropY, cropW, cropH } = calcCropRect(
      img.width,
      img.height,
      targetW / targetH,
      cropOffsetX,
      cropOffsetY
    )
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH)
    return { mode: 'cover', cropX, cropY, cropW, cropH }
  }

  const { drawW, drawH, offsetX, offsetY } = calcFitRect(
    img.width,
    img.height,
    targetW,
    targetH
  )
  ctx.drawImage(img, 0, 0, img.width, img.height, offsetX, offsetY, drawW, drawH)
  return { mode: 'contain', drawW, drawH, offsetX, offsetY }
}

/** 允许与上限的接近误差（字节），仅用于日志展示 */
const NEAR_LIMIT_TOLERANCE = 4096

/**
 * 在不超过 maxBytes 的前提下，二分查找最高 JPEG 质量，使体积尽量接近上限
 */
async function encodeMaxUnderBytes(canvas, w, h, maxBytes, renderFrame) {
  let low = 0.08
  let high = 0.98
  let best = null

  const tryQuality = async (q) => {
    renderFrame()
    const path = await exportCanvas(canvas, 'jpg', q, w, h)
    const size = await getFileSize(path)
    return { path, size, quality: q }
  }

  const minResult = await tryQuality(0.08)
  if (minResult.size > maxBytes) {
    return { result: null, tooLarge: true, minSize: minResult.size }
  }
  best = minResult

  while (high - low > 0.012) {
    const mid = (low + high) / 2
    const current = await tryQuality(mid)
    if (current.size <= maxBytes) {
      if (!best || current.size > best.size) best = current
      low = mid
    } else {
      high = mid
    }
  }

  const topResult = await tryQuality(high)
  if (topResult.size <= maxBytes && (!best || topResult.size > best.size)) {
    best = topResult
  }

  return { result: best, hit: true }
}

/**
 * 一键合规：整图缩放(contain) 或 居中裁剪(cover) → 转格式 → 压 KB
 */
async function processCompliance(options) {
  const {
    canvas,
    srcPath,
    scene,
    cropOffsetX = 0.5,
    cropOffsetY = 0.5,
    fitMode = 'contain',
    onLog
  } = options

  const log = (msg) => {
    if (onLog) onLog(msg)
  }

  const ctx = canvas.getContext('2d')
  const targetW = scene.width
  const targetH = scene.height
  const maxKB = scene.maxKB
  const maxBytes = maxKB * 1024
  const fileType = scene.format === 'png' ? 'png' : 'jpg'

  canvas.width = targetW
  canvas.height = targetH

  const img = await loadCanvasImage(canvas, srcPath)
  const drawMeta = drawToCanvas(ctx, img, targetW, targetH, fitMode, cropOffsetX, cropOffsetY)

  if (fitMode === 'cover') {
    log('已居中裁剪并缩放')
  } else {
    log('已整图缩放（完整保留，不裁剪）')
  }
  log(`已适配至 ${targetW}×${targetH}`)

  if (fileType === 'png') {
    const resultPath = await exportCanvas(canvas, 'png', 1, targetW, targetH)
    const size = await getFileSize(resultPath)
    if (size > maxBytes) {
      throw new Error(`无法压至 ${maxKB}KB 以内，请换一张更小的原图`)
    }
    log(`已转为 PNG，当前 ${Math.round(size / 1024)}KB（不超过 ${maxKB}KB）`)
    const outInfo = await getImageSize(resultPath)
    return { path: resultPath, width: outInfo.width, height: outInfo.height, size, quality: 1, logs: [] }
  }

  const renderFrame = () => {
    drawToCanvas(ctx, img, targetW, targetH, fitMode, cropOffsetX, cropOffsetY)
  }

  let encoded = await encodeMaxUnderBytes(canvas, targetW, targetH, maxBytes, renderFrame)
  let scale = 1

  while (encoded.tooLarge && scale > 0.4) {
    scale -= 0.08
    log(`加强压缩，缩小画面至 ${Math.round(scale * 100)}%`)
    const scaledRender = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, targetW, targetH)
      if (fitMode === 'cover' && drawMeta.cropW) {
        const sw = Math.round(targetW * scale)
        const sh = Math.round(targetH * scale)
        const ox = Math.round((targetW - sw) / 2)
        const oy = Math.round((targetH - sh) / 2)
        ctx.drawImage(
          img, drawMeta.cropX, drawMeta.cropY, drawMeta.cropW, drawMeta.cropH,
          ox, oy, sw, sh
        )
      } else {
        const tw = Math.round(drawMeta.drawW * scale)
        const th = Math.round(drawMeta.drawH * scale)
        const ox = Math.round((targetW - tw) / 2)
        const oy = Math.round((targetH - th) / 2)
        ctx.drawImage(img, 0, 0, img.width, img.height, ox, oy, tw, th)
      }
    }
    encoded = await encodeMaxUnderBytes(canvas, targetW, targetH, maxBytes, scaledRender)
  }

  if (!encoded.result) {
    throw new Error(`无法压至 ${maxKB}KB 以内，请换一张更小的原图`)
  }

  const { path: resultPath, size } = encoded.result
  const outKB = Math.round(size / 1024)
  const gapKB = maxKB - outKB
  if (gapKB <= 4) {
    log(`已压至 ${outKB}KB，接近上限 ${maxKB}KB 且未超出`)
  } else {
    log(`已压至 ${outKB}KB（不超过 ${maxKB}KB，原图信息量有限时无法更接近）`)
  }

  const outInfo = await getImageSize(resultPath)

  return {
    path: resultPath,
    width: outInfo.width,
    height: outInfo.height,
    size,
    quality: encoded.result.quality,
    logs: []
  }
}

/** 目标体积比例：填 500 时尽量达到 490KB（96%）以上，绝不超过 100% */
const TARGET_FILL_RATIO = 0.96

/**
 * 在允许放大画面的前提下，尽量接近体积上限但不超出
 */
async function compressNearLimit(canvas, srcPath, maxKB, options = {}) {
  const { onLog, allowUpscale = true } = options
  const log = (msg) => { if (onLog) onLog(msg) }

  const maxBytes = maxKB * 1024
  const targetMinBytes = Math.floor(maxBytes * TARGET_FILL_RATIO)
  const info = await getImageSize(srcPath)
  const img = await loadCanvasImage(canvas, srcPath)
  const ctx = canvas.getContext('2d')
  const baseW = info.width
  const baseH = info.height

  const tryAtScale = async (scale) => {
    const w = Math.max(1, Math.round(baseW * scale))
    const h = Math.max(1, Math.round(baseH * scale))
    canvas.width = w
    canvas.height = h
    const renderFrame = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
    }
    const encoded = await encodeMaxUnderBytes(canvas, w, h, maxBytes, renderFrame)
    if (!encoded.result) return null
    return { ...encoded.result, width: w, height: h, scale }
  }

  let best = await tryAtScale(1)
  if (!best) {
    throw new Error(`无法压至 ${maxKB}KB 以内，请换一张更小的原图`)
  }

  if (allowUpscale && best.size < targetMinBytes) {
    log(`原图最高约 ${Math.round(best.size / 1024)}KB，放大画面以接近 ${maxKB}KB`)
    let lo = 1
    let hi = 4
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      const cur = await tryAtScale(mid)
      if (!cur) {
        hi = mid
        continue
      }
      if (cur.size <= maxBytes) {
        if (!best || cur.size > best.size) best = cur
        lo = mid
      } else {
        hi = mid
      }
    }
    const extras = [best.scale * 1.03, best.scale * 1.06, best.scale * 1.1].filter((s) => s <= 4.5)
    for (const s of extras) {
      const cur = await tryAtScale(s)
      if (cur && cur.size <= maxBytes && cur.size > best.size) best = cur
    }
  }

  const outKB = (best.size / 1024).toFixed(1)
  const targetKB = Math.round(maxKB * TARGET_FILL_RATIO)
  if (best.size >= targetMinBytes) {
    log(`已压至 ${outKB}KB，接近 ${maxKB}KB 且未超出`)
  } else {
    log(`已压至 ${outKB}KB（不超过 ${maxKB}KB，原图已达上限）`)
  }

  const outInfo = await getImageSize(best.path)
  return {
    path: best.path,
    width: outInfo.width,
    height: outInfo.height,
    size: best.size
  }
}

/** 仅体积压缩：尽量接近上限但不超出 */
async function compressVolumeOnly(canvas, srcPath, maxKB, options = {}) {
  return compressNearLimit(canvas, srcPath, maxKB, { ...options, allowUpscale: true })
}

module.exports = {
  calcCropRect,
  calcFitRect,
  processCompliance,
  compressVolumeOnly,
  compressNearLimit,
  encodeMaxUnderBytes,
  getFileSize,
  exportCanvas,
  NEAR_LIMIT_TOLERANCE,
  TARGET_FILL_RATIO
}
