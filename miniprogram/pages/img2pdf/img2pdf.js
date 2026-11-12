const {
  createPdfFromImages,
  MAX_PAGES,
  MAX_PDF_MB,
  toPdfFileName
} = require('../../utils/pdf-maker')
const { buildShareMessage } = require('../../utils/share')

const fs = wx.getFileSystemManager()
const DEFAULT_PDF_NAME = '图片'

Page({
  onShareAppMessage() {
    return buildShareMessage('宇图助手 - 多张图片一键转 PDF')
  },

  data: {
    images: [],
    converting: false,
    pdfPath: '',
    pdfName: DEFAULT_PDF_NAME,
    pdfFileName: '',
    autoCompressed: false,
    pdfSizeText: '',
    maxPages: MAX_PAGES,
    maxPdfMb: MAX_PDF_MB
  },

  resetPdfResult() {
    return {
      pdfPath: '',
      pdfFileName: '',
      autoCompressed: false,
      pdfSizeText: ''
    }
  },

  cleanupPdf(path = this.data.pdfPath) {
    if (!path || !path.startsWith(wx.env.USER_DATA_PATH)) return
    fs.unlink({ filePath: path, fail: () => {} })
  },

  chooseImages() {
    const remain = MAX_PAGES - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: `最多 ${MAX_PAGES} 张，请先清空`, icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: Math.min(9, remain),
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['original'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.cleanupPdf()
        this.setData({
          images: [...this.data.images, ...paths],
          ...this.resetPdfResult()
        })
      }
    })
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(index, 1)
    this.cleanupPdf()
    this.setData({ images, ...this.resetPdfResult() })
  },

  clearImages() {
    this.cleanupPdf()
    this.setData({
      images: [],
      pdfName: DEFAULT_PDF_NAME,
      ...this.resetPdfResult()
    })
  },

  onPdfNameInput(e) {
    this.setData({ pdfName: e.detail.value })
  },

  getCanvas() {
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
    const { images, pdfName } = this.data
    if (!images.length) return

    this.cleanupPdf()
    this.setData({ converting: true, ...this.resetPdfResult() })
    wx.showLoading({ title: '合成 PDF...', mask: true })

    try {
      await new Promise((resolve) => this.setData({}, resolve))
      const canvas = await this.getCanvas()
      const result = await createPdfFromImages(
        images,
        canvas,
        this,
        (current, total) => {
          wx.showLoading({ title: `合成中 ${current}/${total}`, mask: true })
        },
        pdfName
      )
      const pdfSizeText = `${(result.sizeBytes / 1024 / 1024).toFixed(2)}MB`
      this.setData({
        pdfPath: result.path,
        pdfFileName: result.fileName,
        autoCompressed: result.autoCompressed,
        pdfSizeText,
        converting: false
      })
      wx.showToast({
        title: result.autoCompressed ? 'PDF 已生成（已降画质）' : 'PDF 已生成',
        icon: 'success'
      })
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

  applyPdfRename() {
    const { pdfPath, pdfName } = this.data
    if (!pdfPath) return

    const pdfFileName = toPdfFileName(pdfName)
    const base = pdfFileName.replace(/\.pdf$/i, '')
    const newPath = `${wx.env.USER_DATA_PATH}/${base}_${Date.now()}.pdf`

    fs.copyFile({
      srcPath: pdfPath,
      destPath: newPath,
      success: () => {
        this.cleanupPdf(pdfPath)
        this.setData({ pdfPath: newPath, pdfFileName })
        wx.showToast({ title: '文件名已更新', icon: 'success' })
      },
      fail: () => wx.showToast({ title: '重命名失败', icon: 'none' })
    })
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
    const { pdfPath, pdfFileName } = this.data
    if (!pdfPath) return
    if (wx.shareFileMessage) {
      wx.shareFileMessage({
        filePath: pdfPath,
        fileName: pdfFileName || toPdfFileName(this.data.pdfName),
        fail: () => wx.showToast({ title: '分享失败', icon: 'none' })
      })
    } else {
      wx.showToast({ title: '请先点「打开预览」', icon: 'none' })
    }
  },

  onUnload() {
    this.cleanupPdf()
  }
})
