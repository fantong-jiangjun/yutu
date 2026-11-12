const { splitToGrid } = require('../../utils/grid-split')
const { buildShareMessage } = require('../../utils/share')

Page({
  onShareAppMessage() {
    return buildShareMessage('宇图助手 - 九宫格图片切图')
  },

  data: {
    srcPath: '',
    pieces: [],
    splitting: false,
    saving: false
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath
        this.setData({ srcPath: path, pieces: [] })
      }
    })
  },

  previewPiece(e) {
    const { index } = e.currentTarget.dataset
    const { pieces } = this.data
    if (!pieces.length) return

    wx.previewImage({
      current: pieces[index].path,
      urls: pieces.map((p) => p.path)
    })
  },

  getCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#gridCanvas')
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

  async onSplit() {
    const { srcPath } = this.data
    if (!srcPath) return

    this.setData({ splitting: true, pieces: [] })
    wx.showLoading({ title: '切图中...', mask: true })

    try {
      const canvas = await this.getCanvas()
      const { pieces } = await splitToGrid(canvas, srcPath)
      this.setData({ pieces, splitting: false })
      wx.showToast({ title: '切图完成', icon: 'success' })
    } catch (err) {
      wx.showModal({
        title: '切图失败',
        content: err.message || '请换一张图片重试',
        showCancel: false
      })
      this.setData({ splitting: false })
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

  async saveAll() {
    const { pieces } = this.data
    if (!pieces.length) return

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })

    try {
      await this.ensureAlbumAuth()
      for (let i = 0; i < pieces.length; i++) {
        await new Promise((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
            filePath: pieces[i].path,
            success: resolve,
            fail: reject
          })
        })
      }
      wx.showToast({ title: '已保存 9 张', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
      wx.hideLoading()
    }
  }
})
