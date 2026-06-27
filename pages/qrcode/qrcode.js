const { exportQR } = require('../../utils/qrcode-draw')

function isHttpUrl(text) {
  return /^https?:\/\//i.test(String(text || '').trim())
}

Page({
  data: {
    url: '',
    showResult: false,
    generating: false,
    qrPath: ''
  },

  onInput(e) {
    this.setData({ url: e.detail.value, qrPath: '' })
  },

  getCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .in(this)
        .select('#qrExportCanvas')
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

  async onGenerate() {
    const url = (this.data.url || '').trim()
    if (!url) {
      wx.showToast({ title: '请先输入链接', icon: 'none' })
      return
    }
    if (!isHttpUrl(url)) {
      wx.showToast({ title: '请输入 http 或 https 开头的链接', icon: 'none' })
      return
    }

    this.setData({ generating: true, showResult: true, qrPath: '' })
    wx.showLoading({ title: '生成中...', mask: true })

    try {
      await new Promise((resolve) => this.setData({}, resolve))
      const canvas = await this.getCanvas()
      const qrPath = await exportQR(canvas, url, 800)
      this.setData({ qrPath, generating: false })
      wx.showToast({ title: '生成成功', icon: 'success' })
    } catch (err) {
      wx.showModal({
        title: '生成失败',
        content: err.message || '链接过长或格式不支持，请缩短后重试',
        showCancel: false
      })
      this.setData({ generating: false, showResult: false })
    } finally {
      wx.hideLoading()
    }
  },

  ensureAlbumAuth() {
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum']) {
            resolve()
            return
          }
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: resolve,
            fail: () => {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存到相册',
                confirmText: '去设置',
                success: (modal) => {
                  if (modal.confirm) {
                    wx.openSetting({
                      success: (setting) => {
                        if (setting.authSetting['scope.writePhotosAlbum']) resolve()
                        else reject(new Error('未授权相册'))
                      },
                      fail: reject
                    })
                  } else {
                    reject(new Error('未授权相册'))
                  }
                }
              })
            }
          })
        },
        fail: reject
      })
    })
  },

  async saveQR() {
    const { qrPath } = this.data
    if (!qrPath) return
    try {
      await this.ensureAlbumAuth()
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath: qrPath, success: resolve, fail: reject })
      })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  copyUrl() {
    const url = (this.data.url || '').trim()
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  }
})
