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

function getImageSize(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject })
  })
}

/** 将图片切成 3×3 九宫格 */
async function splitToGrid(canvas, srcPath) {
  const info = await getImageSize(srcPath)
  const img = await loadCanvasImage(canvas, srcPath)
  const ctx = canvas.getContext('2d')
  const totalW = info.width
  const totalH = info.height
  const cellW = Math.floor(totalW / 3)
  const cellH = Math.floor(totalH / 3)
  const pieces = []

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const sx = col * cellW
      const sy = row * cellH
      const cw = col === 2 ? totalW - cellW * 2 : cellW
      const ch = row === 2 ? totalH - cellH * 2 : cellH

      canvas.width = cw
      canvas.height = ch
      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch)

      const path = await exportCanvas(canvas, 'jpg', 0.92, cw, ch)
      pieces.push({
        path,
        index: row * 3 + col + 1,
        row,
        col
      })
    }
  }

  return { pieces, cellW, cellH, totalW, totalH }
}

module.exports = {
  splitToGrid
}
