/**
 * secCheck 云函数单元测试（mock wx-server-sdk）：node tests/cloud-function.test.js
 */
const Module = require('module')
const path = require('path')
const assert = require('assert')

// ---------- 假的 wx-server-sdk ----------
const state = {}
function resetState(over = {}) {
  Object.assign(state, {
    msgSuggest: 'pass',
    imgRisky: false,
    imgError: null,
    tasks: [],
    deleted: [],
    mediaCalls: [],
    collectionExists: true,
    ...over
  })
}
resetState()

const fakeDb = {
  serverDate: () => 'NOW',
  command: { in: (arr) => ({ $in: arr }) },
  createCollection: async () => { state.collectionExists = true },
  collection: () => {
    let where = {}
    const q = {
      where(w) { where = w; return q },
      field() { return q },
      limit() { return q },
      async get() {
        const data = state.tasks.filter((t) => Object.entries(where).every(([k, v]) =>
          v && v.$in ? v.$in.includes(t[k]) : t[k] === v))
        return { data }
      },
      async add({ data }) {
        if (!state.collectionExists) { const e = new Error('collection not exists'); e.errCode = -502005; throw e }
        const _id = `id${state.tasks.length}`
        state.tasks.push({ _id, ...data })
        return { _id }
      },
      doc(id) {
        return { update: async ({ data }) => Object.assign(state.tasks.find((t) => t._id === id), data) }
      }
    }
    return q
  }
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'env',
  init() {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: 'openid-1' }),
  downloadFile: async () => ({ fileContent: Buffer.from('img') }),
  getTempFileURL: async ({ fileList }) => ({ fileList: [{ tempFileURL: `https://tmp/${fileList[0].fileID}` }] }),
  deleteFile: async ({ fileList }) => { state.deleted.push(...fileList) },
  openapi: {
    security: {
      msgSecCheck: async ({ content, version, openid }) => {
        assert.strictEqual(version, 2)
        assert.ok(openid)
        return { errCode: 0, result: { suggest: state.msgSuggest, label: 100 }, content }
      },
      imgSecCheck: async () => {
        if (state.imgError) throw state.imgError
        if (state.imgRisky) { const e = new Error('risky'); e.errCode = 87014; throw e }
        return { errCode: 0 }
      },
      mediaCheckAsync: async (args) => {
        state.mediaCalls.push(args)
        return { errCode: 0, traceId: `trace-${state.mediaCalls.length}` }
      }
    }
  }
}

const origResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...rest) {
  if (req === 'wx-server-sdk') return 'wx-server-sdk'
  return origResolve.call(this, req, ...rest)
}
require.cache['wx-server-sdk'] = { id: 'wx-server-sdk', filename: 'wx-server-sdk', loaded: true, exports: fakeCloud }

const { main } = require(path.join(__dirname, '..', 'cloudfunctions', 'secCheck', 'index.js'))

// ---------- 用例 ----------
const cases = []
const test = (name, fn) => cases.push({ name, fn })

test('文本正常 → pass', async () => {
  resetState()
  const r = await main({ action: 'text', content: '火锅' })
  assert.deepStrictEqual([r.ok, r.pass], [true, true])
})

test('文本违规（risky / review）→ 不通过', async () => {
  for (const s of ['risky', 'review']) {
    resetState({ msgSuggest: s })
    const r = await main({ action: 'text', content: 'xx' })
    assert.strictEqual(r.pass, false)
  }
})

test('空文本直接通过', async () => {
  resetState({ msgSuggest: 'risky' })
  assert.strictEqual((await main({ action: 'text', content: '  ' })).pass, true)
})

test('图片同步检测违规 → 不通过，删除云存储副本，不发起异步检测', async () => {
  resetState({ imgRisky: true })
  const r = await main({ action: 'image', fileID: 'cloud://a.jpg' })
  assert.strictEqual(r.pass, false)
  assert.deepStrictEqual(state.deleted, ['cloud://a.jpg'])
  assert.strictEqual(state.mediaCalls.length, 0)
})

test('图片同步通过 → 发起 mediaCheckAsync v2 并记录任务', async () => {
  resetState()
  const r = await main({ action: 'image', fileID: 'cloud://b.jpg' })
  assert.strictEqual(r.pass, true)
  assert.strictEqual(r.traceId, 'trace-1')
  const call = state.mediaCalls[0]
  assert.strictEqual(call.version, 2)
  assert.strictEqual(call.mediaType, 2)
  assert.strictEqual(call.openid, 'openid-1')
  assert.ok(call.mediaUrl.includes('cloud://b.jpg'))
  assert.strictEqual(state.tasks[0].status, 'pending')
})

test('集合不存在时自动创建后写入', async () => {
  resetState({ collectionExists: false })
  const r = await main({ action: 'image', fileID: 'cloud://c.jpg' })
  assert.strictEqual(r.pass, true)
  assert.strictEqual(state.tasks.length, 1)
})

test('接口异常 → ok:false（小程序端据此不放行）', async () => {
  const e = new Error('system busy'); e.errCode = -1
  resetState({ imgError: e })
  const r = await main({ action: 'image', fileID: 'cloud://d.jpg' })
  assert.strictEqual(r.ok, false)
})

test('消息推送 wxa_media_check：更新结果并删除副本；status 查询识别违规', async () => {
  resetState()
  await main({ action: 'image', fileID: 'cloud://e.jpg' })
  await main({ action: 'image', fileID: 'cloud://f.jpg' })
  let s = await main({ action: 'status', traceIds: ['trace-1', 'trace-2'] })
  assert.deepStrictEqual([s.pass, s.pending], [true, 2])

  const ret = await main({ Event: 'wxa_media_check', trace_id: 'trace-2', result: { suggest: 'risky', label: 20002 } })
  assert.strictEqual(ret, 'success')
  assert.deepStrictEqual(state.deleted, ['cloud://f.jpg'])
  await main({ Event: 'wxa_media_check', trace_id: 'trace-1', result: { suggest: 'pass', label: 100 } })

  s = await main({ action: 'status', traceIds: ['trace-1', 'trace-2'] })
  assert.deepStrictEqual([s.pass, s.pending, s.riskyTraceIds], [false, 0, ['trace-2']])
  s = await main({ action: 'status', traceIds: ['trace-1'] })
  assert.strictEqual(s.pass, true)
})

test('status 只能查到自己 openid 的记录', async () => {
  resetState()
  state.tasks.push({ _id: 'x', traceId: 't-other', openid: 'someone-else', status: 'done', suggest: 'risky' })
  const s = await main({ action: 'status', traceIds: ['t-other'] })
  assert.strictEqual(s.pass, true)
})

test('未知 action → ok:false', async () => {
  assert.strictEqual((await main({ action: 'nope' })).ok, false)
})

;(async () => {
  let fail = 0
  for (const c of cases) {
    try { await c.fn(); console.log(`  ✔ ${c.name}`) } catch (e) { fail++; console.log(`  ✘ ${c.name}\n      ${e.message}`) }
  }
  console.log(`\n云函数测试 ${cases.length} 项，失败 ${fail}`)
  process.exit(fail ? 1 : 0)
})()
