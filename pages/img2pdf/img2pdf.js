const { createPdfFromImages } = require('../../utils/pdf-maker')

Page({
  data: {
    images: [],
    converting: false,
    pdfPath: ''
  },

  chooseImages() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({
          images: [...this.data.images, ...paths],
          pdfPath: ''
        })
      }
    })
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(index, 1)
    this.setData({ images, pdfPath: '' })
  },

  clearImages() {
    this.setData({ images: [], pdfPath: '' })
  },

  getCanvas() {
    if (typeof wx.createOffscreenCanvas === 'function') {
      return Promise.resolve(wx.createOffscreenCanvas({ type: '2d', width: 800, height: 800 }))
    }
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .in(this)
        .select('#pdfCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            reject(new Error('Canvas 初始化失败'))
            return
          }
          resolve(res[0].node)
        })
    })
  },

  async onConvert() {
    const { images } = this.data
    if (!images.length) return

    this.setData({ converting: true, pdfPath: '' })
    wx.showLoading({ title: '合成 PDF...', mask: true })

    try {
      await new Promise((resolve) => this.setData({}, resolve))
      const canvas = await this.getCanvas()
      const pdfPath = await createPdfFromImages(images, canvas)
      this.setData({ pdfPath, converting: false })
      wx.showToast({ title: 'PDF 已生成', icon: 'success' })
    } catch (err) {
      wx.showModal({
        title: '转换失败',
        content: err.message || '请换一张图片重试',
        showCancel: false
      })
      this.setData({ converting: false })
    } finally {
      wx.hideLoading()
    }
  },

  openPdf() {
    const { pdfPath } = this.data
    if (!pdfPath) return
    wx.openDocument({
      filePath: pdfPath,
      fileType: 'pdf',
      showMenu: true,
      fail: () => wx.showToast({ title: '无法打开 PDF', icon: 'none' })
    })
  },

  sharePdf() {
    const { pdfPath } = this.data
    if (!pdfPath) return
    if (wx.shareFileMessage) {
      wx.shareFileMessage({
        filePath: pdfPath,
        fileName: '图片.pdf',
        fail: () => wx.showToast({ title: '分享失败', icon: 'none' })
      })
    } else {
      wx.showToast({ title: '请先点「打开预览」', icon: 'none' })
    }
  }
})
