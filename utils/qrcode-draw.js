const qrcode = require('../libs/qrcode-generator')

function drawQRCode(canvas, text, displaySize) {
  if (!text || !text.trim()) throw new Error('请输入要生成二维码的内容')
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const margin = 4
  const cellSize = Math.max(1, Math.floor(displaySize / (count + margin * 2)))
  const size = cellSize * (count + margin * 2)
  const ctx = canvas.getContext('2d')
  canvas.width = size
  canvas.height = size
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#000000'
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize)
      }
    }
  }
  return size
}

function exportQR(canvas, text, displaySize) {
  const size = drawQRCode(canvas, text, displaySize)
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: size,
      height: size,
      destWidth: size,
      destHeight: size,
      fileType: 'png',
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    })
  })
}

module.exports = {
  drawQRCode,
  exportQR
}
