const { formatKB, runDetection } = require('../../utils/detect')
const { canSaveFree, getRemainingFreeSaves, recordSave, FREE_SAVE_PER_DAY } = require('../../utils/quota')
const { applyMaxKBToScene } = require('../../utils/scenes')
const { compressVolumeOnly } = require('../../utils/image-processor')

Page({
  data: {
    session: null,
    compareMode: 'after',
    remainingFree: FREE_SAVE_PER_DAY,
    saving: false,
    zoomScale: 1,
    fileName: '',
    resultFormat: 'JPG',
    paramTitle: '成品信息',
    paramRows: [],
    recompressKB: '',
    recompressing: false
  },

  rewardedAd: null,

  onLoad() {
    const session = wx.getStorageSync('baotu_result_session')
    if (!session || !session.resultPath) {
      wx.showToast({ title: '无结果数据', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    const fileName = `${session.scene.shortName}_${Math.round(session.afterSize / 1024)}KB.${session.scene.format || 'jpg'}`
    const resultFormat = (session.scene.format || 'jpg').toUpperCase()
    this.setData({
      session,
      remainingFree: getRemainingFreeSaves(),
      fileName,
      resultFormat,
      recompressKB: String(session.scene.maxKB)
    }, () => {
      this.updateParamView('after')
    })
    this.initRewardedAd()
  },

  buildParamRows(mode) {
    const { session, fileName, resultFormat } = this.data
    if (!session) return []

    if (mode === 'before') {
      const info = session.beforeReport && session.beforeReport.imageInfo
      return [
        { label: '体积', value: formatKB(session.beforeSize) },
        { label: '尺寸', value: info ? `${info.width}×${info.height}` : '-' },
        { label: '格式', value: info ? (info.format || '-').toUpperCase() : '-' }
      ]
    }

    const rows = [
      { label: '体积', value: formatKB(session.afterSize), highlight: true },
      {
        label: '体积要求',
        value: `≤${session.scene.maxKB}KB（尽量接近，如约 ${Math.round(session.scene.maxKB * 0.96)}KB）`
      },
      {
        label: '尺寸',
        value: `${session.resultWidth}×${session.resultHeight}`,
        highlight: true
      },
      { label: '格式', value: resultFormat, highlight: true }
    ]

    if (session.fitModeLabel) {
      rows.push({ label: '处理方式', value: session.fitModeLabel })
    }
    rows.push({ label: '建议文件名', value: fileName, highlight: true })
    return rows
  },

  updateParamView(mode) {
    this.setData({
      compareMode: mode,
      paramTitle: mode === 'before' ? '原图信息' : '成品信息',
      paramRows: this.buildParamRows(mode),
      zoomScale: 1
    })
  },

  initRewardedAd() {
    const app = getApp()
    const adUnitId = app.globalData.adUnitIds.rewarded
    if (!adUnitId || !wx.createRewardedVideoAd) return

    this.rewardedAd = wx.createRewardedVideoAd({ adUnitId })
    this.rewardedAd.onError(() => {})
  },

  showCompareBefore() {
    this.updateParamView('before')
  },

  showCompareAfter() {
    this.updateParamView('after')
  },

  onZoomIn() {
    const s = Math.min(this.data.zoomScale + 0.25, 3)
    this.setData({ zoomScale: s })
  },

  onZoomOut() {
    const s = Math.max(this.data.zoomScale - 0.25, 1)
    this.setData({ zoomScale: s })
  },

  async doSave() {
    const { session } = this.data
    if (!session) return

    this.setData({ saving: true })

    try {
      await this.ensureAlbumAuth()
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: session.resultPath,
          success: resolve,
          fail: reject
        })
      })
      recordSave()
      this.setData({ remainingFree: getRemainingFreeSaves() })
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (e) {
      if (e.errMsg && e.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting()
          }
        })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  ensureAlbumAuth() {
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum']) {
            resolve()
          } else {
            wx.authorize({
              scope: 'scope.writePhotosAlbum',
              success: resolve,
              fail: reject
            })
          }
        },
        fail: reject
      })
    })
  },

  onSaveTap() {
    if (canSaveFree()) {
      this.doSave()
      return
    }
    this.showAdThenSave()
  },

  showAdThenSave() {
    const app = getApp()
    const adUnitId = app.globalData.adUnitIds.rewarded

    if (!adUnitId || !this.rewardedAd) {
      wx.showModal({
        title: '今日免费次数已用完',
        content: `每日免费保存 ${FREE_SAVE_PER_DAY} 次。开通流量主后配置激励视频广告 ID，超出次数需观看广告。是否仍要保存？`,
        success: (res) => {
          if (res.confirm) this.doSave()
        }
      })
      return
    }

    this.rewardedAd.show().catch(() => {
      this.rewardedAd.load().then(() => this.rewardedAd.show())
    })

    this.rewardedAd.offClose && this.rewardedAd.offClose()
    this.rewardedAd.onClose((res) => {
      if (res && res.isEnded) {
        this.doSave()
      } else {
        wx.showToast({ title: '需完整观看广告', icon: 'none' })
      }
    })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onRecompressKBInput(e) {
    this.setData({ recompressKB: e.detail.value })
  },

  async onRecompressToKB() {
    const { session, recompressKB } = this.data
    if (!session || !session.resultPath) return

    const kb = parseInt(recompressKB, 10)
    if (!kb || kb < 10) {
      wx.showToast({ title: '请输入有效 KB（≥10）', icon: 'none' })
      return
    }

    const nextScene = applyMaxKBToScene(session.scene, kb)
    if (!nextScene) {
      wx.showToast({ title: 'KB 无效', icon: 'none' })
      return
    }

    this.setData({ recompressing: true })
    wx.showLoading({ title: '压缩中...', mask: true })

    const srcPath = session.originalPath || session.resultPath

    try {
      await new Promise((resolve) => this.setData({}, resolve))
      const query = wx.createSelectorQuery()
      query.select('#recompressCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          try {
            const canvas = res[0].node
            const result = await compressVolumeOnly(canvas, srcPath, kb)
            const afterReport = await runDetection(result.path, nextScene)
            const newKB = Math.round(result.size / 1024)
            const fileName = `${nextScene.shortName}_${newKB}KB.${nextScene.format || 'jpg'}`
            const logMsg = `重新压缩至约 ${Math.round(kb * 0.96)}KB，当前 ${newKB}KB（不超过 ${kb}KB）`
            const logs = [...(session.processLogs || []), logMsg]
            const nextSession = {
              ...session,
              scene: nextScene,
              resultPath: result.path,
              afterSize: result.size,
              afterReport,
              processLogs: logs,
              resultWidth: result.width,
              resultHeight: result.height,
              skippedProcess: false
            }
            wx.setStorageSync('baotu_result_session', nextSession)
            this.setData({
              session: nextSession,
              fileName,
              recompressKB: String(kb),
              recompressing: false
            }, () => this.updateParamView('after'))
            wx.showToast({ title: `已压至 ${newKB}KB`, icon: 'success' })
          } catch (err) {
            wx.showModal({
              title: '处理失败',
              content: err.message || '请调整目标 KB 或换图',
              showCancel: false
            })
            this.setData({ recompressing: false })
          } finally {
            wx.hideLoading()
          }
        })
    } catch (e) {
      wx.hideLoading()
      this.setData({ recompressing: false })
      wx.showToast({ title: '处理失败', icon: 'none' })
    }
  }
})
