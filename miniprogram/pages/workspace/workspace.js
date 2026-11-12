const {
  getSceneById,
  buildCustomScene,
  buildSizeOnlyScene,
  applyMaxKBToScene,
  getDefaultFitMode,
  SIZE_OPTIONS
} = require('../../utils/scenes')
const { runDetection, formatKB } = require('../../utils/detect')
const { processCompliance, compressVolumeOnly } = require('../../utils/image-processor')
const { buildShareMessage } = require('../../utils/share')

Page({
  onShareAppMessage() {
    return buildShareMessage('宇图助手 - 报名照片智能处理')
  },

  data: {
    flowMode: 'exam',
    scene: null,
    imagePath: '',
    previewPath: '',
    report: null,
    processing: false,
    cropOffsetX: 50,
    cropOffsetY: 50,
    processLogs: [],
    showCropAdjust: false,
    step: 'pick',
    sizeOptions: SIZE_OPTIONS,
    showCustomKB: false,
    customMaxKB: '200',
    specSelected: false,
    fitMode: 'contain',
    userMaxKB: '200',
    selectedSpecId: '',
    fitModeOptions: [
      { id: 'contain', name: '整图缩放', desc: '完整保留图片，不裁剪，白边补齐' },
      { id: 'cover', name: '居中裁剪', desc: '证件照头像适用，会裁掉多余区域' }
    ]
  },

  onLoad(options) {
    if (options.mode === 'smart') {
      wx.setNavigationBarTitle({ title: '传图选规格' })
      this.setData({ flowMode: 'smart', step: 'pick' })
      return
    }

    let scene
    if (options.sceneId === 'custom') {
      scene = buildCustomScene({
        width: options.width,
        height: options.height,
        maxKB: options.maxKB,
        format: options.format || 'jpg'
      })
    } else {
      scene = getSceneById(options.sceneId)
    }

    if (!scene) {
      wx.showToast({ title: '场景无效', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    wx.setNavigationBarTitle({ title: scene.name })
    const fitMode = getDefaultFitMode(scene)
    this.setData({
      flowMode: 'exam',
      scene,
      step: 'pick',
      userMaxKB: String(scene.maxKB),
      fitMode,
      showCropAdjust: fitMode === 'cover'
    })
  },

  chooseAlbum() {
    this.pickImage(['album'])
  },

  chooseCamera() {
    this.pickImage(['camera'])
  },

  pickImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      sizeType: ['original'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath
        const patch = {
          imagePath: path,
          previewPath: path,
          showCropAdjust: false,
          report: null,
          specSelected: false,
          processLogs: []
        }
        if (this.data.flowMode === 'smart') {
          patch.step = 'chooseSpec'
          patch.scene = null
          patch.selectedSpecId = ''
          patch.showCustomKB = false
        }
        this.setData(patch, () => {
          if (this.data.flowMode === 'exam' && this.data.scene) {
            this.runDetect(path)
          }
        })
      }
    })
  },

  onSizeOptionTap(e) {
    const id = e.currentTarget.dataset.id
    let userMaxKB = this.data.userMaxKB || '200'
    let fitMode = this.data.fitMode
    if (id !== 'size_only') {
      const preset = getSceneById(id)
      if (preset) {
        userMaxKB = String(preset.maxKB)
        fitMode = getDefaultFitMode(preset)
      }
    }
    this.setData({
      selectedSpecId: id,
      userMaxKB,
      fitMode,
      showCropAdjust: fitMode === 'cover'
    })
  },

  async onConfirmSpecAndDetect() {
    const { selectedSpecId, userMaxKB, imagePath } = this.data
    if (!selectedSpecId) {
      wx.showToast({ title: '请先选择规格类型', icon: 'none' })
      return
    }
    const kb = parseInt(userMaxKB, 10)
    if (!kb || kb < 10) {
      wx.showToast({ title: '请输入有效 KB（≥10）', icon: 'none' })
      return
    }
    wx.showLoading({ title: '准备检测...', mask: true })
    try {
      let scene
      if (selectedSpecId === 'size_only') {
        const info = await new Promise((resolve, reject) => {
          wx.getImageInfo({ src: imagePath, success: resolve, fail: reject })
        })
        scene = buildSizeOnlyScene(kb, info.width, info.height)
      } else {
        scene = applyMaxKBToScene(getSceneById(selectedSpecId), kb)
      }
      if (!scene) {
        wx.hideLoading()
        wx.showToast({ title: '规格无效', icon: 'none' })
        return
      }
      wx.hideLoading()
      const fitMode = getDefaultFitMode(scene)
      this.setData({
        scene,
        specSelected: true,
        userMaxKB: String(kb),
        step: 'detect',
        fitMode,
        showCropAdjust: fitMode === 'cover'
      })
      wx.setNavigationBarTitle({ title: scene.name })
      await this.runDetect(imagePath)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '读取图片失败', icon: 'none' })
    }
  },

  onCustomKBInput(e) {
    this.setData({ customMaxKB: e.detail.value, userMaxKB: e.detail.value })
  },

  async onConfirmCustomKB() {
    this.setData({ selectedSpecId: 'size_only' })
    await this.onConfirmSpecAndDetect()
  },

  async applySceneAndDetect(sceneId) {
    const scene = getSceneById(sceneId)
    if (!scene) return
    const fitMode = getDefaultFitMode(scene)
    this.setData({
      scene,
      specSelected: true,
      showCustomKB: false,
      userMaxKB: String(scene.maxKB),
      fitMode,
      showCropAdjust: fitMode === 'cover'
    })
    wx.setNavigationBarTitle({ title: scene.name })
    const report = await this.runDetect(this.data.imagePath)
  },

  async runDetect(path) {
    const { scene } = this.data
    if (!scene) return
    wx.showLoading({ title: '检测中...', mask: true })
    try {
      const report = await runDetection(path, scene)
      this.setData({ report, step: 'detect' })
      return report
    } catch (e) {
      wx.showToast({ title: '检测失败', icon: 'none' })
      return null
    } finally {
      wx.hideLoading()
    }
  },

  goToResultDirect() {
    const { scene, imagePath, report } = this.data
    if (!scene || !imagePath || !report) return
    const session = {
      scene,
      originalPath: imagePath,
      resultPath: imagePath,
      beforeReport: report,
      afterReport: report,
      processLogs: ['照片已符合规格，无需处理'],
      beforeSize: report.fileSize,
      afterSize: report.fileSize,
      resultWidth: report.imageInfo.width,
      resultHeight: report.imageInfo.height,
      skippedProcess: true
    }
    wx.setStorageSync('baotu_result_session', session)
    wx.navigateTo({ url: '/pages/result/result' })
  },

  onUserMaxKBInput(e) {
    this.setData({ userMaxKB: e.detail.value })
  },

  async onApplyMaxKB() {
    const { scene, userMaxKB, imagePath } = this.data
    if (!scene || !imagePath) return
    const nextScene = applyMaxKBToScene(scene, userMaxKB)
    if (!nextScene) {
      wx.showToast({ title: '请输入有效 KB（≥10）', icon: 'none' })
      return
    }
    this.setData({ scene: nextScene })
    await this.runDetect(imagePath)
  },

  onCropXChange(e) {
    this.setData({ cropOffsetX: e.detail.value })
  },

  onCropYChange(e) {
    this.setData({ cropOffsetY: e.detail.value })
  },

  toggleCropAdjust() {
    this.setData({ showCropAdjust: !this.data.showCropAdjust })
  },

  onFitModeTap(e) {
    const fitMode = e.currentTarget.dataset.mode
    this.setData({ fitMode, showCropAdjust: fitMode === 'cover' })
  },

  onPrimaryAction() {
    const { report } = this.data
    if (report && report.pass) {
      this.goToResultDirect()
    } else {
      this.onProcess()
    }
  },

  resolveSceneWithUserKB() {
    const { scene, userMaxKB } = this.data
    if (!scene) return null
    const next = applyMaxKBToScene(scene, userMaxKB)
    return next || scene
  },

  async onProcess() {
    const { imagePath, cropOffsetX, cropOffsetY, fitMode, userMaxKB } = this.data
    const scene = this.resolveSceneWithUserKB()
    if (!imagePath || !scene) {
      wx.showToast({ title: '请先选择照片和规格', icon: 'none' })
      return
    }
    const kb = parseInt(userMaxKB, 10)
    if (!kb || kb < 10) {
      wx.showToast({ title: '请输入有效 KB（≥10）', icon: 'none' })
      return
    }
    this.setData({ scene })

    this.setData({ processing: true, processLogs: [] })
    wx.showLoading({ title: '处理中...', mask: true })

    const logs = []
    const onLog = (msg) => {
      logs.push(msg)
      this.setData({ processLogs: [...logs] })
    }

    try {
      await new Promise((resolve) => this.setData({}, resolve))
      const query = wx.createSelectorQuery()
      query.select('#processCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          try {
            if (!res[0] || !res[0].node) throw new Error('Canvas 初始化失败')
            const canvas = res[0].node
            let result
            if (scene.checkMode === 'sizeOnly') {
              onLog('开始压缩体积')
              result = await compressVolumeOnly(canvas, imagePath, scene.maxKB, { onLog })
              onLog(`已压至 ${Math.round(result.size / 1024)}KB，尽量接近 ${scene.maxKB}KB 且不超出`)
            } else {
              result = await processCompliance({
                canvas,
                srcPath: imagePath,
                scene,
                cropOffsetX: cropOffsetX / 100,
                cropOffsetY: cropOffsetY / 100,
                fitMode: scene.checkMode === 'sizeOnly' ? 'contain' : fitMode,
                onLog
              })
            }

            const fitModeLabel = scene.checkMode === 'sizeOnly'
              ? '仅体积压缩'
              : (fitMode === 'cover' ? '居中裁剪' : '整图缩放')
            const afterReport = await runDetection(result.path, scene)
            if (!afterReport.pass) {
              throw new Error('处理后的图片未通过规格复检，请调整参数后重试')
            }

            const session = {
              scene,
              originalPath: imagePath,
              resultPath: result.path,
              beforeReport: this.data.report,
              afterReport,
              processLogs: logs,
              beforeSize: this.data.report ? this.data.report.fileSize : 0,
              afterSize: result.size,
              resultWidth: result.width,
              resultHeight: result.height,
              skippedProcess: false,
              fitMode,
              fitModeLabel
            }
            wx.setStorageSync('baotu_result_session', session)

            wx.hideLoading()
            wx.navigateTo({ url: '/pages/result/result' })
          } catch (err) {
            wx.hideLoading()
            wx.showModal({
              title: '处理失败',
              content: err.message || '请换一张图片重试',
              showCancel: false
            })
          } finally {
            this.setData({ processing: false })
          }
        })
    } catch (e) {
      wx.hideLoading()
      this.setData({ processing: false })
      wx.showToast({ title: '处理失败', icon: 'none' })
    }
  },

  formatKB(bytes) {
    return formatKB(bytes)
  }
})
