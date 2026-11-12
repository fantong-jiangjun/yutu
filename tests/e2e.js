/**
 * 端到端功能测试（微信开发者工具模拟器 + miniprogram-automator）
 *
 *   cd tests && npm install && node e2e.js
 *
 * 前置：开发者工具已登录，设置 → 安全设置 → 服务端口 已开启。
 * 环境变量 WX_CLI 可指定 cli.bat 路径。
 * 选图、相册、文件分享、内容安全云函数均为 mock，云函数本身未在此测试中部署。
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const ROOT = path.resolve(__dirname, '..')
const CLI = process.env.WX_CLI || 'E:\\微信小程序\\微信web开发者工具\\cli.bat'
const FIXTURES = ['home.png', 'photo-result.png', 'pdf-result.png'].map((f) => path.join(ROOT, 'docs', 'demo', f))

const results = []
let mp

function to(p, label, ms = 30000) {
  if (process.env.E2E_DEBUG) console.log('      ·', label)
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' 超时')), ms))])
}

function ev(fn, ...args) {
  return Promise.race([
    mp.evaluate(fn, ...args),
    new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate 超时')), 30000))
  ])
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function test(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - t0 })
    console.log(`  ✔ ${name}`)
  } catch (e) {
    results.push({ name, ok: false, err: e.message })
    console.log(`  ✘ ${name}\n      ${e.message}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function waitFor(fn, timeout = 15000, label = '条件') {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(250)
  }
  throw new Error(`等待超时：${label}`)
}

// ---------- 模拟器内的 mock ----------
async function installMocks() {
  await ev(() => {
    const app = getApp()
    app.__sec = { image: true, text: true, status: true, fail: false, calls: [] }
    app.__ui = { modals: [], toasts: [], saved: [], shared: [] }
    const cloud = wx.cloud || {}
    cloud.init = () => {}
    cloud.uploadFile = (o) => Promise.resolve({ fileID: `cloud://mock/${o.cloudPath}` })
    cloud.callFunction = (o) => {
      const s = getApp().__sec
      s.calls.push(o.data)
      if (s.fail) return Promise.reject(new Error('mock 网络异常'))
      const a = o.data.action
      let r
      if (a === 'image') r = { ok: true, pass: s.image, traceId: s.image ? `trace-${s.calls.length}` : undefined }
      else if (a === 'text') r = { ok: true, pass: s.text }
      else r = { ok: true, pass: s.status, pending: 0 }
      return Promise.resolve({ result: r })
    }
    if (!wx.cloud) wx.cloud = cloud
    return null
  })
  await mp.mockWxMethod('showModal', function (opt) {
    getApp().__ui.modals.push(`${opt.title}|${opt.content}`)
    return { confirm: true, cancel: false, content: getApp().__ui.modalInput || '' }
  })
  await mp.mockWxMethod('showToast', function (opt) {
    getApp().__ui.toasts.push(opt.title)
    return { errMsg: 'showToast:ok' }
  })
  await mp.mockWxMethod('getSetting', { authSetting: { 'scope.writePhotosAlbum': true }, errMsg: 'getSetting:ok' })
  await mp.mockWxMethod('saveImageToPhotosAlbum', function (opt) {
    getApp().__ui.saved.push(opt.filePath)
    return { errMsg: 'saveImageToPhotosAlbum:ok' }
  })
  await mp.mockWxMethod('shareFileMessage', function (opt) {
    getApp().__ui.shared.push(opt.fileName)
    return { errMsg: 'shareFileMessage:ok' }
  })
  await mp.mockWxMethod('openDocument', { errMsg: 'openDocument:ok' })
}

async function resetUi(sec = {}) {
  await ev((sec) => {
    const app = getApp()
    Object.assign(app.__sec, { image: true, text: true, status: true, fail: false, calls: [] }, sec)
    app.__ui = { modals: [], toasts: [], saved: [], shared: [], modalInput: '' }
    wx.removeStorageSync('baotu_daily_save')
    return null
  }, sec)
}

const ui = () => ev(() => getApp().__ui)
const secCalls = () => ev(() => getApp().__sec.calls)
const setSec = (sec) => ev((sec) => { Object.assign(getApp().__sec, sec); return null }, sec)

// 把测试图片写进模拟器用户目录
async function writeFixtures() {
  const out = []
  for (let i = 0; i < FIXTURES.length; i++) {
    const b64 = fs.readFileSync(FIXTURES[i]).toString('base64')
    const p = await ev((b64, i) => {
      const p = `${wx.env.USER_DATA_PATH}/fixture_${i}.png`
      wx.getFileSystemManager().writeFileSync(p, b64, 'base64')
      return p
    }, b64, i)
    out.push(p)
  }
  return out
}

async function mockPick(paths) {
  await mp.mockWxMethod('chooseMedia', {
    type: 'image',
    errMsg: 'chooseMedia:ok',
    tempFiles: paths.map((p) => ({ tempFilePath: p, size: 30000, fileType: 'image' }))
  })
}

async function open(url) {
  await to(mp.reLaunch(url), 'reLaunch ' + url)
  const want = url.replace(/^\//, '').split('?')[0]
  const page = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c && c.path === want && c }, 10000, `打开 ${url}`)
  await sleep(600)
  return page
}

// automator 的 page.callMethod 在新基础库上不可用，这里直接调用当前页面实例的方法
async function call(method, ...args) {
  return ev((method, args) => {
    const p = getCurrentPages().pop()
    if (typeof p[method] !== 'function') throw new Error(`页面 ${p.route} 没有方法 ${method}`)
    const r = p[method](...args)
    if (r && typeof r.then === 'function') return r.then(() => null)
    return r === undefined ? null : r
  }, method, args)
}

const tap = (id) => ({ currentTarget: { dataset: { id, index: id } }, detail: {} })

async function main() {
  console.log('启动开发者工具自动化...')
  // 若已通过 `cli.bat auto --project <根目录> --auto-port 9420` 开启自动化，则直接连接
  mp = process.env.WX_WS
    ? await automator.connect({ wsEndpoint: process.env.WX_WS })
    : await automator.launch({ cliPath: CLI, projectPath: ROOT, timeout: 120000 })
  mp.on('exception', (e) => console.log('      [小程序异常]', e.message))
  await mp.reLaunch('/pages/index/index')
  await sleep(1500)
  await installMocks()
  const imgs = await writeFixtures()

  console.log('\n[首页与导航]')
  await test('首页 6 个入口均能跳转', async () => {
    const targets = {
      goSmartUpload: 'pages/workspace/workspace', goCustom: 'pages/custom/custom',
      goImg2Pdf: 'pages/img2pdf/img2pdf', goGridCut: 'pages/grid-cut/grid-cut',
      goQrcode: 'pages/qrcode/qrcode', goEat: 'pages/eat/eat'
    }
    for (const [m, p] of Object.entries(targets)) {
      const home = await open('/pages/index/index')
      await call(m)
      const cur = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c.path === p && c }, 8000, `${m} -> ${p}`)
      assert(cur.path === p, `${m} 跳转到 ${cur.path}`)
    }
  })

  await test('所有页面分享均指向首页', async () => {
    const pages = ['index/index', 'img2pdf/img2pdf', 'custom/custom', 'grid-cut/grid-cut', 'qrcode/qrcode', 'eat/eat', 'eat-manage/eat-manage', 'workspace/workspace?mode=smart']
    for (const p of pages) {
      const page = await open(`/pages/${p}`)
      await sleep(300)
      const s = await call('onShareAppMessage')
      assert(s && s.path === '/pages/index/index' && s.title, `${p} 分享配置异常 ${JSON.stringify(s)}`)
    }
  })

  console.log('\n[报名照处理]')
  await test('传图选规格：一寸照 → 处理 → 结果页尺寸 295×413 并保存', async () => {
    await resetUi()
    const page = await open('/pages/workspace/workspace?mode=smart')
    await sleep(500)
    await mockPick([imgs[0]])
    await call('chooseAlbum')
    await waitFor(async () => (await page.data('step')) === 'chooseSpec', 15000, '进入选规格')
    assert(await page.data('secTraceId'), '未记录图片检测 traceId')
    await call('onSizeOptionTap', tap('one_inch'))
    await call('onConfirmSpecAndDetect')
    await waitFor(async () => await page.data('report'), 15000, '检测报告')
    await call('onPrimaryAction')
    const res = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c.path === 'pages/result/result' && c }, 30000, '进入结果页')
    await sleep(800)
    const s = await res.data('session')
    assert(s.resultWidth === 295 && s.resultHeight === 413, `尺寸 ${s.resultWidth}×${s.resultHeight}`)
    assert(s.afterReport.pass, '复检未通过')
    assert(s.afterSize <= 200 * 1024, `体积 ${s.afterSize}`)
    assert(Array.isArray(s.secTraceIds) && s.secTraceIds[0], 'session 中缺少 secTraceIds')
    await call('onSaveTap')
    await waitFor(async () => (await ui()).saved.length === 1, 10000, '保存到相册')
    assert((await secCalls()).some((c) => c.action === 'status'), '保存前未查询异步检测结果')
  })

  await test('结果页：异步复核判定违规时禁止保存', async () => {
    const res = await mp.currentPage()
    assert(res.path === 'pages/result/result', '不在结果页')
    await resetUi({ status: false })
    await call('onSaveTap')
    await waitFor(async () => (await ui()).modals.length, 8000, '违规弹窗')
    const u = await ui()
    assert(u.saved.length === 0, '违规图片仍被保存')
    assert(u.modals[0].includes('违规'), `弹窗内容 ${u.modals[0]}`)
  })

  await test('结果页：免费次数用完时，先做内容检测再提示广告/额度', async () => {
    const res = await mp.currentPage()
    assert(res.path === 'pages/result/result', '不在结果页')
    const exhaust = () => ev(() => {
      const d = new Date()
      wx.setStorageSync('baotu_daily_save', { [`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`]: 3 })
      return null
    })
    // 违规：只出现违规提示，不出现额度/广告提示
    await resetUi({ status: false })
    await exhaust()
    await call('onSaveTap')
    await waitFor(async () => (await ui()).modals.length, 8000, '弹窗')
    await sleep(800)
    let u = await ui()
    assert(u.modals.length === 1 && u.modals[0].includes('违规'), `弹窗 ${JSON.stringify(u.modals)}`)
    // 正常：出现额度提示，确认后保存
    await resetUi()
    await exhaust()
    await call('onSaveTap')
    await waitFor(async () => (await ui()).saved.length === 1, 8000, '额度确认后保存')
    u = await ui()
    assert(u.modals.some((m) => m.includes('免费次数')), `未提示额度 ${JSON.stringify(u.modals)}`)
  })

  await test('结果页：重新压缩到 50KB', async () => {
    await resetUi()
    const res = await mp.currentPage()
    await call('onRecompressKBInput', { detail: { value: '50' } })
    await call('onRecompressToKB')
    await waitFor(async () => !(await res.data('recompressing')) && (await res.data('session')).afterSize <= 50 * 1024, 30000, '重新压缩')
  })

  await test('四六级场景：选图自动检测 → 处理为 144×192 JPG', async () => {
    await resetUi()
    const page = await open('/pages/workspace/workspace?sceneId=cet')
    await sleep(500)
    await mockPick([imgs[1]])
    await call('chooseAlbum')
    const report = await waitFor(async () => await page.data('report'), 15000, '自动检测')
    assert(report.pass === false, 'PNG 原图应检测为不合规')
    await call('onPrimaryAction')
    const res = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c.path === 'pages/result/result' && c }, 30000, '进入结果页')
    await sleep(800)
    const s = await res.data('session')
    assert(s.resultWidth === 144 && s.resultHeight === 192, `尺寸 ${s.resultWidth}×${s.resultHeight}`)
    assert(s.afterReport.imageInfo.format === 'jpg' || s.afterReport.imageInfo.format === 'jpeg', `格式 ${s.afterReport.imageInfo.format}`)
  })

  await test('选图违规：图片被拦截且提示违规', async () => {
    await resetUi({ image: false })
    const page = await open('/pages/workspace/workspace?mode=smart')
    await sleep(500)
    await mockPick([imgs[0]])
    await call('chooseAlbum')
    await waitFor(async () => (await ui()).modals.length, 15000, '违规弹窗')
    assert(!(await page.data('imagePath')), '违规图片仍被载入')
    assert((await ui()).modals[0].includes('违规'), '弹窗未提示违规')
  })

  await test('检测服务异常：不放行并提示失败', async () => {
    await resetUi({ fail: true })
    const page = await open('/pages/workspace/workspace?mode=smart')
    await sleep(500)
    await mockPick([imgs[0]])
    await call('chooseAlbum')
    await waitFor(async () => (await ui()).modals.length, 15000, '失败弹窗')
    assert(!(await page.data('imagePath')), '检测失败时图片仍被载入')
    assert((await ui()).modals[0].includes('检测失败'), (await ui()).modals[0])
  })

  console.log('\n[自定义规格]')
  await test('自定义规格：非法输入提示，合法输入跳转工作台', async () => {
    await resetUi()
    const page = await open('/pages/custom/custom')
    await sleep(300)
    await page.setData({ width: '5', height: '413', maxKB: '200' })
    await call('onSubmit')
    await waitFor(async () => (await ui()).toasts.length, 5000, '提示')
    await page.setData({ width: '300', height: '400', maxKB: '80', formatIndex: 1 })
    await call('onSubmit')
    const ws = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c.path === 'pages/workspace/workspace' && c }, 8000, '跳转工作台')
    await sleep(500)
    const scene = await ws.data('scene')
    assert(scene.width === 300 && scene.height === 400 && scene.maxKB === 80 && scene.format === 'png', JSON.stringify(scene))
  })

  console.log('\n[图片转 PDF]')
  await test('选 3 张图 → 合成 PDF → 重命名 → 分享', async () => {
    await resetUi()
    const page = await open('/pages/img2pdf/img2pdf')
    await sleep(500)
    await mockPick(imgs)
    await call('chooseImages')
    await waitFor(async () => (await page.data('images')).length === 3, 20000, '载入 3 张')
    assert((await page.data('traceIds')).length === 3, 'traceIds 数量不一致')
    await call('removeImage', { currentTarget: { dataset: { index: 1 } } })
    assert((await page.data('images')).length === 2 && (await page.data('traceIds')).length === 2, '删除后数量不一致')
    await call('onPdfNameInput', { detail: { value: '测试文档' } })
    await call('onConvert')
    const pdfPath = await waitFor(async () => await page.data('pdfPath'), 40000, '生成 PDF')
    const head = await ev((p) => {
      const fs = wx.getFileSystemManager()
      return { head: fs.readFileSync(p, 'binary', 0, 5), size: fs.statSync(p).size }
    }, pdfPath)
    assert(head.head === '%PDF-' && head.size > 1000, `PDF 文件异常 ${JSON.stringify(head)}`)
    await call('onPdfNameInput', { detail: { value: '新名字' } })
    await call('applyPdfRename')
    await waitFor(async () => (await page.data('pdfFileName')) === '新名字.pdf', 8000, '重命名')
    await call('sharePdf')
    await waitFor(async () => (await ui()).shared.length === 1, 8000, '分享 PDF')
  })

  await test('PDF 文件名违规：拒绝合成', async () => {
    const page = await mp.currentPage()
    await resetUi({ text: false })
    await call('onConvert')
    await waitFor(async () => (await ui()).modals.length, 8000, '违规弹窗')
    assert((await ui()).modals[0].includes('违规'), (await ui()).modals[0])
  })

  await test('PDF 多图中部分违规：违规图片被移除', async () => {
    await resetUi({ image: false })
    const page = await open('/pages/img2pdf/img2pdf')
    await sleep(500)
    await mockPick([imgs[0]])
    await call('chooseImages')
    await waitFor(async () => (await ui()).modals.length, 15000, '违规弹窗')
    assert((await page.data('images')).length === 0, '违规图片仍被加入')
  })

  console.log('\n[九宫格]')
  await test('选图 → 切 9 张 → 全部保存', async () => {
    await resetUi()
    const page = await open('/pages/grid-cut/grid-cut')
    await sleep(500)
    await mockPick([imgs[0]])
    await call('chooseImage')
    await waitFor(async () => await page.data('srcPath'), 15000, '载入图片')
    await call('onSplit')
    await waitFor(async () => (await page.data('pieces')).length === 9, 30000, '切出 9 张')
    await call('saveAll')
    await waitFor(async () => (await ui()).saved.length === 9, 15000, '保存 9 张')
  })

  await test('九宫格：异步复核违规时禁止保存', async () => {
    const page = await mp.currentPage()
    await resetUi({ status: false })
    await call('saveAll')
    await waitFor(async () => (await ui()).modals.length, 8000, '违规弹窗')
    assert((await ui()).saved.length === 0, '违规仍保存')
  })

  console.log('\n[二维码]')
  await test('非 http 链接被拒绝；合法链接生成并保存', async () => {
    await resetUi()
    const page = await open('/pages/qrcode/qrcode')
    await sleep(500)
    await call('onInput', { detail: { value: 'abc' } })
    await call('onGenerate')
    await waitFor(async () => (await ui()).toasts.length, 5000, '格式提示')
    assert(!(await secCalls()).length, '非法格式不应调用检测')
    await call('onInput', { detail: { value: 'https://example.com/a?b=1' } })
    await call('onGenerate')
    await waitFor(async () => await page.data('qrPath'), 15000, '生成二维码')
    assert((await secCalls()).some((c) => c.action === 'text' && c.content.includes('example.com')), '未做文本检测')
    await call('saveQR')
    await waitFor(async () => (await ui()).saved.length === 1, 8000, '保存二维码')
  })

  await test('二维码链接违规：不生成', async () => {
    await resetUi({ text: false })
    const page = await open('/pages/qrcode/qrcode')
    await sleep(500)
    await call('onInput', { detail: { value: 'https://bad.example.com' } })
    await call('onGenerate')
    await waitFor(async () => (await ui()).modals.length, 8000, '违规弹窗')
    assert(!(await page.data('qrPath')), '违规仍生成了二维码')
  })

  console.log('\n[今天吃什么]')
  await test('转盘旋转出结果', async () => {
    await resetUi()
    const page = await open('/pages/eat/eat')
    await sleep(500)
    const items = await page.data('items')
    assert(items.length >= 2, '转盘选项不足')
    await call('onSpin')
    const r = await waitFor(async () => await page.data('result'), 8000, '转盘结果')
    assert(items.includes(r), `结果 ${r} 不在选项中`)
  })

  await test('新建转盘 → 编辑添加选项 → 保存', async () => {
    await resetUi()
    await ev(() => { getApp().__ui.modalInput = '测试转盘'; return null })
    const page = await open('/pages/eat-manage/eat-manage')
    await sleep(500)
    await call('onCreate')
    const edit = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c.path === 'pages/eat-edit/eat-edit' && c }, 8000, '进入编辑页')
    await sleep(500)
    assert((await edit.data('name')) === '测试转盘', '名称未带入')
    await call('onNewItemInput', { detail: { value: '火锅' } })
    await call('onAddItem')
    await waitFor(async () => (await edit.data('items')).includes('火锅'), 8000, '添加选项')
    await call('onSave')
    await waitFor(async () => (await ui()).toasts.includes('已保存'), 8000, '保存')
  })

  await test('转盘选项违规：不添加', async () => {
    await resetUi()
    await ev(() => { getApp().__ui.modalInput = '再一个'; return null })
    await open('/pages/eat-manage/eat-manage')
    await call('onCreate')
    const edit = await waitFor(async () => { const c = await to(mp.currentPage(), 'currentPage', 10000); return c.path === 'pages/eat-edit/eat-edit' && c }, 8000, '进入编辑页')
    await sleep(600)
    await resetUi({ text: false })
    const before = (await edit.data('items')).length
    await call('onNewItemInput', { detail: { value: '违规词' } })
    await call('onAddItem')
    await waitFor(async () => (await ui()).modals.length, 8000, '违规弹窗')
    assert((await ui()).modals[0].includes('违规'), (await ui()).modals[0])
    assert((await edit.data('items')).length === before, '违规选项被加入')
  })

  mp.disconnect()
}

main()
  .catch(async (e) => {
    console.error('测试中断：', e.message)
    if (mp) mp.disconnect()
    results.push({ name: '测试运行', ok: false, err: e.message })
  })
  .finally(() => {
    const fail = results.filter((r) => !r.ok)
    console.log(`\n共 ${results.length} 项，通过 ${results.length - fail.length}，失败 ${fail.length}`)
    process.exit(fail.length ? 1 : 0)
  })
