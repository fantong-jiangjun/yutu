const { getTargetKB } = require('./scenes')

function formatKB(bytes) {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}

function detectFormat(path, imageInfo) {
  const lower = (path || '').toLowerCase()
  if (lower.includes('.png') || imageInfo.type === 'png') return 'png'
  if (lower.includes('.jpg') || lower.includes('.jpeg') || imageInfo.type === 'jpg') return 'jpg'
  if (lower.includes('.webp') || imageInfo.type === 'webp') return 'webp'
  if (lower.includes('.gif') || imageInfo.type === 'gif') return 'gif'
  return imageInfo.type || 'unknown'
}

function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: reject
    })
  })
}

/**
 * 全面检测照片合规性
 */
async function runDetection(imagePath, scene) {
  const targetKB = getTargetKB(scene)
  const logs = []

  let imageInfo
  try {
    imageInfo = await new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: resolve,
        fail: reject
      })
    })
  } catch (e) {
    return buildFailedReport('图片无法读取，请换一张', scene, targetKB)
  }

  let fileSize = null
  try {
    fileSize = await getFileSize(imagePath)
  } catch (e) {}

  const format = detectFormat(imagePath, imageInfo)
  const width = imageInfo.width
  const height = imageInfo.height
  const aspectRatio = width / height
  const targetRatio = scene.aspectRatio
  const ratioDiff = Math.abs(aspectRatio - targetRatio) / targetRatio

  const checks = []

  const sizeOnly = scene.checkMode === 'sizeOnly'

  const formatOk = scene.format === 'jpg'
    ? (format === 'jpg' || format === 'jpeg')
    : format === scene.format
  checks.push({
    key: 'format',
    label: '文件格式',
    pass: formatOk,
    current: format.toUpperCase(),
    expected: scene.format.toUpperCase(),
    message: formatOk ? '格式符合' : `需要 ${scene.format.toUpperCase()}，当前 ${format.toUpperCase()}`
  })

  const sizeReadable = Number.isFinite(fileSize) && fileSize >= 0
  const sizeOk = sizeReadable && fileSize <= scene.maxKB * 1024
  checks.push({
    key: 'size',
    label: '文件大小',
    pass: sizeOk,
    current: sizeReadable ? formatKB(fileSize) : '读取失败',
    expected: `≤${scene.maxKB}KB（尽量接近）`,
    message: !sizeReadable
      ? '无法读取文件大小，请重新选择图片'
      : (sizeOk
          ? '大小符合（尽量接近上限）'
          : `超出 ${formatKB(fileSize - scene.maxKB * 1024)}，需压缩`)
  })

  if (!sizeOnly) {
    const dimOk = width === scene.width && height === scene.height
    checks.push({
      key: 'dimension',
      label: '图片尺寸',
      pass: dimOk,
      current: `${width}×${height}`,
      expected: `${scene.width}×${scene.height}`,
      message: dimOk ? '尺寸符合' : '尺寸不符，需裁剪缩放'
    })

    const ratioOk = ratioDiff < 0.02
    checks.push({
      key: 'ratio',
      label: '宽高比例',
      pass: ratioOk,
      current: aspectRatio.toFixed(3),
      expected: targetRatio.toFixed(3),
      message: ratioOk ? '比例符合' : '比例不符，需裁剪'
    })
  } else {
    checks.push({
      key: 'dimension',
      label: '图片尺寸',
      pass: true,
      current: `${width}×${height}`,
      expected: '保持不变',
      message: '仅压缩体积，尽量接近上限'
    })
  }

  checks.push({
    key: 'readable',
    label: '图片可读',
    pass: true,
    current: '正常',
    expected: '正常',
    message: '图片可正常解码'
  })

  const allPass = checks.every((c) => c.pass)
  const failItems = checks.filter((c) => !c.pass)

  const dimCheck = checks.find((c) => c.key === 'dimension')
  const ratioCheck = checks.find((c) => c.key === 'ratio')
  const dimOk = !dimCheck || dimCheck.pass
  const ratioOk = !ratioCheck || ratioCheck.pass

  let gapText = ''
  if (!sizeReadable) {
    gapText = '无法读取文件大小，请重新选择图片'
  } else if (!sizeOk && fileSize > 0) {
    const pct = Math.round((1 - (scene.maxKB * 1024) / fileSize) * 100)
    gapText = `体积需缩小约 ${Math.max(pct, 5)}%，尽量接近 ${targetKB}KB 且不超出`
  } else if (!dimOk || !ratioOk) {
    gapText = `需裁剪并缩放至 ${scene.width}×${scene.height}`
  } else if (!formatOk) {
    gapText = `需转换为 ${scene.format.toUpperCase()}`
  }

  const suggestions = []
  if (!ratioOk || !dimOk) suggestions.push('按比例裁剪')
  if (!formatOk) suggestions.push('转换格式')
  if (!sizeOk || !dimOk) suggestions.push('压缩体积')
  const repairHint = suggestions.length
    ? `推荐：${suggestions.join(' → ')} → 尽量接近 ${targetKB}KB 且不超出`
    : '照片已合规，可直接保存'

  return {
    pass: allPass,
    checks,
    failCount: failItems.length,
    gapText: allPass ? '全部指标合格' : gapText,
    repairHint,
    imageInfo: { width, height, format, path: imagePath },
    fileSize,
    targetKB,
    logs
  }
}

function buildFailedReport(msg, scene, targetKB) {
  return {
    pass: false,
    checks: [{
      key: 'readable',
      label: '图片可读',
      pass: false,
      current: '失败',
      expected: '正常',
      message: msg
    }],
    failCount: 1,
    gapText: msg,
    repairHint: '请重新选择图片',
    imageInfo: null,
    fileSize: 0,
    targetKB: targetKB || getTargetKB(scene),
    logs: []
  }
}

module.exports = {
  formatKB,
  detectFormat,
  getFileSize,
  runDetection
}
