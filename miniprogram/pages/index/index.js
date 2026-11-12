const { buildShareMessage } = require('../../utils/share')

Page({
  onShareAppMessage() {
    return buildShareMessage()
  },

  goSmartUpload() {
    wx.navigateTo({ url: '/pages/workspace/workspace?mode=smart' })
  },

  goCustom() {
    wx.navigateTo({ url: '/pages/custom/custom' })
  },

  goImg2Pdf() {
    wx.navigateTo({ url: '/pages/img2pdf/img2pdf' })
  },

  goGridCut() {
    wx.navigateTo({ url: '/pages/grid-cut/grid-cut' })
  },

  goQrcode() {
    wx.navigateTo({ url: '/pages/qrcode/qrcode' })
  },

  goEat() {
    wx.navigateTo({ url: '/pages/eat/eat' })
  }
})
