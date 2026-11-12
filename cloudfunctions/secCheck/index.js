/**
 * 内容安全检测云函数
 *
 * 小程序端调用（wx.cloud.callFunction）：
 *   { action: 'text',   content }        文本同步检测 security.msgSecCheck v2
 *   { action: 'image',  fileID }         图片同步检测 security.imgSecCheck
 *                                        + 异步检测 security.mediaCheckAsync v2
 *   { action: 'status', traceIds: [] }   查询异步检测结果
 *
 * 微信消息推送（云开发控制台 → 设置 → 消息推送，事件 wxa_media_check 指向本函数）：
 *   { Event: 'wxa_media_check', trace_id, result: { suggest, label } }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'sec_check_tasks'
const RISKY_ERRCODE = 87014
// 1 资料 2 评论 3 论坛 4 社交日志
const SCENE = 1

function isPass(suggest) {
  return suggest === 'pass'
}

async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION)
  } catch (e) {
    // 集合已存在时忽略
  }
}

async function checkText(content, openid) {
  const text = String(content || '').trim()
  if (!text) return { pass: true }
  const res = await cloud.openapi.security.msgSecCheck({
    openid,
    scene: SCENE,
    version: 2,
    content: text.slice(0, 2500)
  })
  const suggest = res.result && res.result.suggest
  return { pass: isPass(suggest), suggest, label: res.result && res.result.label }
}

async function syncImageCheck(fileID) {
  const { fileContent } = await cloud.downloadFile({ fileID })
  try {
    await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/jpeg', value: fileContent }
    })
    return true
  } catch (e) {
    if (e.errCode === RISKY_ERRCODE) return false
    throw e
  }
}

async function asyncImageCheck(fileID, openid) {
  const { fileList } = await cloud.getTempFileURL({
    fileList: [{ fileID, maxAge: 24 * 3600 }]
  })
  const mediaUrl = fileList[0] && fileList[0].tempFileURL
  if (!mediaUrl) throw new Error('获取图片临时链接失败')

  const res = await cloud.openapi.security.mediaCheckAsync({
    mediaUrl,
    mediaType: 2,
    version: 2,
    scene: SCENE,
    openid
  })
  const traceId = res.traceId || res.trace_id
  const record = { traceId, fileID, openid, status: 'pending', createdAt: db.serverDate() }
  try {
    await db.collection(COLLECTION).add({ data: record })
  } catch (e) {
    await ensureCollection()
    await db.collection(COLLECTION).add({ data: record })
  }
  return traceId
}

async function checkImage(fileID, openid) {
  if (!fileID) throw new Error('缺少 fileID')
  const syncPass = await syncImageCheck(fileID)
  if (!syncPass) {
    await cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
    return { pass: false, suggest: 'risky' }
  }
  const traceId = await asyncImageCheck(fileID, openid)
  return { pass: true, traceId }
}

async function queryStatus(traceIds, openid) {
  const ids = (traceIds || []).filter(Boolean).slice(0, 50)
  if (!ids.length) return { pass: true, pending: 0 }
  const _ = db.command
  const { data } = await db.collection(COLLECTION)
    .where({ openid, traceId: _.in(ids) })
    .field({ traceId: true, status: true, suggest: true })
    .get()
  const risky = data.filter((d) => d.status === 'done' && !isPass(d.suggest))
  const pending = data.filter((d) => d.status !== 'done').length
  return { pass: risky.length === 0, pending, riskyTraceIds: risky.map((d) => d.traceId) }
}

async function handleMediaCheckPush(event) {
  const traceId = event.trace_id
  const suggest = event.result ? event.result.suggest : (event.isrisky ? 'risky' : 'pass')
  const label = event.result ? event.result.label : undefined
  const { data } = await db.collection(COLLECTION).where({ traceId }).limit(1).get()
  if (data[0]) {
    await db.collection(COLLECTION).doc(data[0]._id).update({
      data: { status: 'done', suggest, label, finishedAt: db.serverDate() }
    })
    // 检测完成后删除云存储中的临时图片
    if (data[0].fileID) {
      await cloud.deleteFile({ fileList: [data[0].fileID] }).catch(() => {})
    }
  }
  return 'success'
}

exports.main = async (event) => {
  if (event.Event === 'wxa_media_check') {
    return handleMediaCheckPush(event)
  }

  const { OPENID } = cloud.getWXContext()
  try {
    switch (event.action) {
      case 'text':
        return { ok: true, ...(await checkText(event.content, OPENID)) }
      case 'image':
        return { ok: true, ...(await checkImage(event.fileID, OPENID)) }
      case 'status':
        return { ok: true, ...(await queryStatus(event.traceIds, OPENID)) }
      default:
        return { ok: false, message: '未知 action' }
    }
  } catch (e) {
    console.error('secCheck error', event.action, e)
    return { ok: false, errCode: e.errCode, message: e.errMsg || e.message || '检测失败' }
  }
}
