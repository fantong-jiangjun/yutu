/**
 * 内容安全检测（微信内容安全 API，经 secCheck 云函数调用）
 *
 * - 图片：选图后立即检测（imgSecCheck 同步拦截 + mediaCheckAsync 异步复核），
 *         保存 / 分享 / 导出前再查询异步复核结果。
 * - 文本：用户输入的链接、名称等在使用前经 msgSecCheck 检测。
 * 检测服务异常时一律不放行（fail closed）。
 */
const { envId } = require('../config/cloud-config')

const MAX_W = 750
const MAX_H = 1334
const MAX_BYTES = 1024 * 1024
const VIOLATION_TEXT = '内容含违规信息，请修改后重试'
const VIOLATION_IMAGE = '所选图片含违规信息，请更换后重试'

let cloudReady = false

function initCloud() {
  if (cloudReady) return true
  if (!wx.cloud) return false
  wx.cloud.init({ env: envId || undefined, traceUser: true })
  cloudReady = true
  return true
}

async function callSecCheck(data) {
  if (!initCloud()) throw new Error('当前微信版本不支持云开发，请升级微信后重试')
  const res = await wx.cloud.callFunction({ name: 'secCheck', data })
  const result = res && res.result
  if (!result || !result.ok) {
    throw new Error((result && result.message) || '内容安全检测失败')
  }
  return result
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }))
}

function compress(src, quality, compressedWidth) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality,
      compressedWidth,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    })
  })
}

function getFileSize(filePath) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: () => resolve(0)
    })
  })
}

/** 生成符合检测接口限制（≤750×1334、≤1MB）的副本，原图不受影响 */
async function prepareCheckCopy(path) {
  const info = await getImageInfo(path)
  const scale = Math.min(1, MAX_W / info.width, MAX_H / info.height)
  const width = Math.max(1, Math.floor(info.width * scale))
  let out = await compress(path, 80, width)
  if ((await getFileSize(out)) > MAX_BYTES) {
    out = await compress(out, 40, width)
  }
  return out
}

/** 检测单张图片，返回 { pass, traceId } */
async function checkImage(path) {
  initCloud()
  const copy = await prepareCheckCopy(path)
  const cloudPath = `sec-check/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: copy })
  const result = await callSecCheck({ action: 'image', fileID })
  return { pass: !!result.pass, traceId: result.traceId || '' }
}

/** 依次检测多张图片，返回与 paths 等长的结果数组 */
async function checkImages(paths, onProgress) {
  const results = []
  for (let i = 0; i < paths.length; i++) {
    if (onProgress) onProgress(i + 1, paths.length)
    results.push(await checkImage(paths[i]))
  }
  return results
}

/** 保存 / 分享前查询异步复核结果；仅当已确认违规时返回 false */
async function isImagesStillSafe(traceIds) {
  const ids = (traceIds || []).filter(Boolean)
  if (!ids.length) return true
  const result = await callSecCheck({ action: 'status', traceIds: ids })
  return !!result.pass
}

/** 检测文本，返回 true 表示通过 */
async function checkText(content) {
  const text = String(content || '').trim()
  if (!text) return true
  const result = await callSecCheck({ action: 'text', content: text })
  return !!result.pass
}

function showViolation(isImage) {
  wx.showModal({
    title: '内容安全提示',
    content: isImage ? VIOLATION_IMAGE : VIOLATION_TEXT,
    showCancel: false
  })
}

function showCheckError(err) {
  wx.showModal({
    title: '内容安全检测失败',
    content: (err && err.message) || '请检查网络后重试',
    showCancel: false
  })
}

/**
 * 图片输出前的统一守卫：通过返回 true；违规或检测失败时弹窗并返回 false
 */
async function guardImagesOutput(traceIds) {
  wx.showLoading({ title: '安全检测中...', mask: true })
  try {
    const safe = await isImagesStillSafe(traceIds)
    wx.hideLoading()
    if (!safe) showViolation(true)
    return safe
  } catch (err) {
    wx.hideLoading()
    showCheckError(err)
    return false
  }
}

/**
 * 选图后的统一守卫：返回 { paths, traceIds }，只保留通过检测的图片。
 * 检测失败时返回 null（已弹窗提示）。
 */
async function guardPickedImages(paths) {
  wx.showLoading({ title: '安全检测中...', mask: true })
  try {
    const results = await checkImages(paths, (cur, total) => {
      if (total > 1) wx.showLoading({ title: `安全检测 ${cur}/${total}`, mask: true })
    })
    wx.hideLoading()
    const passed = { paths: [], traceIds: [] }
    results.forEach((r, i) => {
      if (r.pass) {
        passed.paths.push(paths[i])
        passed.traceIds.push(r.traceId)
      }
    })
    const rejected = paths.length - passed.paths.length
    if (rejected > 0) {
      wx.showModal({
        title: '内容安全提示',
        content: paths.length > 1
          ? `有 ${rejected} 张图片含违规信息，已自动移除`
          : VIOLATION_IMAGE,
        showCancel: false
      })
    }
    return passed
  } catch (err) {
    wx.hideLoading()
    showCheckError(err)
    return null
  }
}

/** 文本使用前的统一守卫：通过返回 true；违规或检测失败时弹窗并返回 false */
async function guardText(content) {
  wx.showLoading({ title: '安全检测中...', mask: true })
  try {
    const pass = await checkText(content)
    wx.hideLoading()
    if (!pass) showViolation(false)
    return pass
  } catch (err) {
    wx.hideLoading()
    showCheckError(err)
    return false
  }
}

module.exports = {
  initCloud,
  checkImage,
  checkImages,
  isImagesStillSafe,
  checkText,
  guardImagesOutput,
  guardPickedImages,
  guardText,
  showViolation,
  showCheckError
}
