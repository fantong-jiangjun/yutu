const MAX_CUSTOM_SIDE = 4096
const MAX_CUSTOM_PIXELS = 16 * 1024 * 1024
const { buildShareMessage } = require('../../utils/share')

Page({
  onShareAppMessage() {
    return buildShareMessage('宇图助手 - 自定义图片尺寸和体积')
  },

  data: {
    width: '295',
    height: '413',
    maxKB: '200',
    formatIndex: 0,
    formats: ['jpg', 'png']
  },

  onWidthInput(e) {
    this.setData({ width: e.detail.value })
  },

  onHeightInput(e) {
    this.setData({ height: e.detail.value })
  },

  onMaxKBInput(e) {
    this.setData({ maxKB: e.detail.value })
  },

  onFormatChange(e) {
    this.setData({ formatIndex: parseInt(e.detail.value, 10) })
  },

  onSubmit() {
    const { width, height, maxKB, formatIndex, formats } = this.data
    const w = parseInt(width, 10)
    const h = parseInt(height, 10)
    const kb = parseInt(maxKB, 10)

    if (!w || !h || w < 10 || h < 10) {
      wx.showToast({ title: '请输入有效宽高', icon: 'none' })
      return
    }
    if (w > MAX_CUSTOM_SIDE || h > MAX_CUSTOM_SIDE || w * h > MAX_CUSTOM_PIXELS) {
      wx.showToast({ title: '尺寸过大，请控制在 4096px 和 1600 万像素内', icon: 'none' })
      return
    }
    if (!kb || kb < 10) {
      wx.showToast({ title: '请输入有效大小限制', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/workspace/workspace?sceneId=custom&width=${w}&height=${h}&maxKB=${kb}&format=${formats[formatIndex]}`
    })
  }
})
