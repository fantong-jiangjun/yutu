Page({
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
    if (!kb || kb < 10) {
      wx.showToast({ title: '请输入有效大小限制', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/workspace/workspace?sceneId=custom&width=${w}&height=${h}&maxKB=${kb}&format=${formats[formatIndex]}`
    })
  }
})
