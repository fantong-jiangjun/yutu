function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function exportCanvas(canvas, fileType, quality, destWidth, destHeight) {
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

function getExportFormat(info) {
  const type = (info.type || '').toLowerCase()
  if (type === 'png') return { fileType: 'png', quality: 1 }
  return { fileType: 'jpg', quality: 1 }
}

function getImageSize(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject })
  })
}

/** 与预览区 aspectFill 正方形一致：居中裁成正方形 */
function getSquareCrop(width, height) {
  const side = Math.min(width, height)
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side
  }
}

/** 将预览区正方形图片切成 3×3 九宫格（原图像素 1:1 导出） */
async function splitToGrid(canvas, srcPath) {
  const info = await getImageSize(srcPath)
  const img = await loadCanvasImage(canvas, srcPath)
  const ctx = canvas.getContext('2d')
  const { fileType, quality } = getExportFormat(info)
  const srcW = img.width || info.width
  const srcH = img.height || info.height
  const { sx, sy, side } = getSquareCrop(srcW, srcH)
  const cellSize = Math.floor(side / 3)
  const pieces = []

  ctx.imageSmoothingEnabled = false

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const srcX = sx + col * cellSize
      const srcY = sy + row * cellSize
      const cw = col === 2 ? side - cellSize * 2 : cellSize
      const ch = row === 2 ? side - cellSize * 2 : cellSize

      canvas.width = cw
      canvas.height = ch
      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(img, srcX, srcY, cw, ch, 0, 0, cw, ch)

      const path = await exportCanvas(canvas, fileType, quality, cw, ch)
      pieces.push({
        path,
        index: row * 3 + col + 1,
        row,
        col,
        width: cw,
        height: ch
      })
    }
  }

  return { pieces, cellSize, cropSide: side, totalW: srcW, totalH: srcH }
}

module.exports = {
  splitToGrid
}
