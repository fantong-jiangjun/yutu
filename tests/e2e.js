/**
 * 端到端功能测试（微信开发者工具模拟器 + miniprogram-automator）
 *
 *   cd tests && npm install && node e2e.js
 *
 * 前置：开发者工具已登录，设置 → 安全设置 → 服务端口 已开启。
 * 若自动启动失败，先执行 `cli.bat auto --project <仓库根目录> --auto-port 9420`，
 * 再以 WX_WS=ws://127.0.0.1:9420 运行。环境变量 WX_CLI 可指定 cli.bat 路径。
 *
 * 选图、相册、文件分享为 mock；图片处理、PDF 合成、切图、二维码均为真实代码。
 * 同时记录所有网络请求，验证全程不向任何服务器上传数据。
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

// 注意：evaluate 的函数必须返回非 undefined，否则 automator 会一直等待
function ev(fn, ...args) {
  return to(mp.evaluate(fn, ...args), 'evaluate')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function test(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
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
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(250)
  }
  throw new Error(`等待超时：${label}`)
}

const current = () => to(mp.currentPage(), 'currentPage', 10000)
const waitPage = (p, timeout = 10000) =>
  waitFor(async () => { const c = await current(); return c && c.path === p && c }, timeout, `进入 ${p}`)

// ---------- 模拟器内的 mock ----------
async function installMocks() {
  await ev(() => {
    getApp().__ui = { modals: [], toasts: [], saved: [], shared: [], net: [], modalInput: '' }
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
  // 记录所有网络请求（应为 0）
  for (const m of ['request', 'uploadFile', 'downloadFile', 'connectSocket']) {
    await mp.mockWxMethod(m, function (opt) {
      getApp().__ui.net.push(opt && opt.url)
      return { errMsg: 'mock:ok', statusCode: 200, data: '' }
    })
  }
}

async function resetUi() {
  await ev(() => {
    const u = getApp().__ui
    Object.assign(u, { modals: [], toasts: [], saved: [], shared: [], modalInput: '' })
    wx.removeStorageSync('baotu_daily_save')
    return null
  })
}

const ui = () => ev(() => getApp().__ui)

async function writeFixtures() {
  const out = []
  for (let i = 0; i < FIXTURES.length; i++) {
    const b64 = fs.readFileSync(FIXTURES[i]).toString('base64')
    out.push(await ev((b64, i) => {
      const p = `${wx.env.USER_DATA_PATH}/fixture_${i}.png`
      wx.getFileSystemManager().writeFileSync(p, b64, 'base64')
      return p
    }, b64, i))
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
  const page = await waitPage(url.replace(/^\//, '').split('?')[0])
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
      await open('/pages/index/index')
      await call(m)
      await waitPage(p, 8000)
    }
  })

  await test('所有页面分享均指向首页', async () => {
    const pages = ['index/index', 'img2pdf/img2pdf', 'custom/custom', 'grid-cut/grid-cut', 'qrcode/qrcode', 'eat/eat', 'eat-manage/eat-manage', 'workspace/workspace?mode=smart']
    for (const p of pages) {
      await open(`/pages/${p}`)
      const s = await call('onShareAppMessage')
      assert(s && s.path === '/pages/index/index' && s.title, `${p} 分享配置异常 ${JSON.stringify(s)}`)
    }
  })

  console.log('\n[报名照处理]')
  await test('传图选规格：一寸照 → 处理 → 结果页 295×413 并保存', async () => {
    await resetUi()
    const page = await open('/pages/workspace/workspace?mode=smart')
    await mockPick([imgs[0]])
    await call('chooseAlbum')
    await waitFor(async () => (await page.data('step')) === 'chooseSpec', 15000, '进入选规格')
    await call('onSizeOptionTap', tap('one_inch'))
    await call('onConfirmSpecAndDetect')
    await waitFor(async () => await page.data('report'), 15000, '检测报告')
    await call('onPrimaryAction')
    const res = await waitPage('pages/result/result', 30000)
    await sleep(800)
    const s = await res.data('session')
    assert(s.resultWidth === 295 && s.resultHeight === 413, `尺寸 ${s.resultWidth}×${s.resultHeight}`)
    assert(s.afterReport.pass, '复检未通过')
    assert(s.afterSize <= 200 * 1024, `体积 ${s.afterSize}`)
    await call('onSaveTap')
    await waitFor(async () => (await ui()).saved.length === 1, 10000, '保存到相册')
  })

  await test('结果页：免费次数用完时提示额度，确认后保存', async () => {
    await waitPage('pages/result/result')
    await resetUi()
    await ev(() => {
      const d = new Date()
      wx.setStorageSync('baotu_daily_save', { [`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`]: 3 })
      return null
    })
    await call('onSaveTap')
    await waitFor(async () => (await ui()).saved.length === 1, 8000, '额度确认后保存')
    const u = await ui()
    assert(u.modals.some((m) => m.includes('免费次数')), `未提示额度 ${JSON.stringify(u.modals)}`)
  })

  await test('结果页：重新压缩到 50KB', async () => {
    const res = await waitPage('pages/result/result')
    await call('onRecompressKBInput', { detail: { value: '50' } })
    await call('onRecompressToKB')
    await waitFor(async () => !(await res.data('recompressing')) && (await res.data('session')).afterSize <= 50 * 1024, 30000, '重新压缩')
  })

  await test('四六级场景：选图自动检测 → 处理为 144×192 JPG', async () => {
    await resetUi()
    const page = await open('/pages/workspace/workspace?sceneId=cet')
    await mockPick([imgs[1]])
    await call('chooseAlbum')
    const report = await waitFor(async () => await page.data('report'), 15000, '自动检测')
    assert(report.pass === false, 'PNG 原图应检测为不合规')
    await call('onPrimaryAction')
    const res = await waitPage('pages/result/result', 30000)
    await sleep(800)
    const s = await res.data('session')
    assert(s.resultWidth === 144 && s.resultHeight === 192, `尺寸 ${s.resultWidth}×${s.resultHeight}`)
    assert(['jpg', 'jpeg'].includes(s.afterReport.imageInfo.format), `格式 ${s.afterReport.imageInfo.format}`)
  })

  console.log('\n[自定义规格]')
  await test('自定义规格：非法输入提示，合法输入跳转工作台', async () => {
    await resetUi()
    const page = await open('/pages/custom/custom')
    await page.setData({ width: '5', height: '413', maxKB: '200' })
    await call('onSubmit')
    await waitFor(async () => (await ui()).toasts.length, 5000, '提示')
    await page.setData({ width: '300', height: '400', maxKB: '80', formatIndex: 1 })
    await call('onSubmit')
    const ws = await waitPage('pages/workspace/workspace', 8000)
    await sleep(500)
    const scene = await ws.data('scene')
    assert(scene.width === 300 && scene.height === 400 && scene.maxKB === 80 && scene.format === 'png', JSON.stringify(scene))
  })

  console.log('\n[图片转 PDF]')
  await test('选 3 张图 → 删除 1 张 → 合成 PDF → 重命名 → 分享', async () => {
    await resetUi()
    const page = await open('/pages/img2pdf/img2pdf')
    await mockPick(imgs)
    await call('chooseImages')
    await waitFor(async () => (await page.data('images')).length === 3, 10000, '载入 3 张')
    await call('removeImage', { currentTarget: { dataset: { index: 1 } } })
    assert((await page.data('images')).length === 2, '删除后数量不对')
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

  console.log('\n[九宫格]')
  await test('选图 → 切 9 张 → 全部保存', async () => {
    await resetUi()
    const page = await open('/pages/grid-cut/grid-cut')
    await mockPick([imgs[0]])
    await call('chooseImage')
    await waitFor(async () => await page.data('srcPath'), 10000, '载入图片')
    await call('onSplit')
    await waitFor(async () => (await page.data('pieces')).length === 9, 30000, '切出 9 张')
    await call('saveAll')
    await waitFor(async () => (await ui()).saved.length === 9, 15000, '保存 9 张')
  })

  console.log('\n[二维码]')
  await test('非 http 链接被拒绝；合法链接生成并保存', async () => {
    await resetUi()
    const page = await open('/pages/qrcode/qrcode')
    await call('onInput', { detail: { value: 'abc' } })
    await call('onGenerate')
    await waitFor(async () => (await ui()).toasts.length, 5000, '格式提示')
    assert(!(await page.data('qrPath')), '非法链接不应生成')
    await call('onInput', { detail: { value: 'https://example.com/a?b=1' } })
    await call('onGenerate')
    await waitFor(async () => await page.data('qrPath'), 15000, '生成二维码')
    await call('saveQR')
    await waitFor(async () => (await ui()).saved.length === 1, 8000, '保存二维码')
  })

  console.log('\n[今天吃什么]')
  await test('转盘旋转出结果', async () => {
    await resetUi()
    const page = await open('/pages/eat/eat')
    const items = await page.data('items')
    assert(items.length >= 2, '转盘选项不足')
    await call('onSpin')
    const r = await waitFor(async () => await page.data('result'), 8000, '转盘结果')
    assert(items.includes(r), `结果 ${r} 不在选项中`)
  })

  await test('新建转盘 → 编辑添加选项 → 保存', async () => {
    await resetUi()
    await ev(() => { getApp().__ui.modalInput = '测试转盘'; return null })
    await open('/pages/eat-manage/eat-manage')
    await call('onCreate')
    const edit = await waitPage('pages/eat-edit/eat-edit', 8000)
    await sleep(500)
    assert((await edit.data('name')) === '测试转盘', '名称未带入')
    await call('onNewItemInput', { detail: { value: '火锅' } })
    await call('onAddItem')
    assert((await edit.data('items')).includes('火锅'), '选项未添加')
    await call('onSave')
    await waitFor(async () => (await ui()).toasts.includes('已保存'), 8000, '保存')
  })

  console.log('\n[隐私]')
  await test('全程没有任何网络请求（照片不上传）', async () => {
    const u = await ui()
    assert(u.net.length === 0, `出现网络请求：${JSON.stringify(u.net)}`)
  })

  mp.disconnect()
}

main()
  .catch((e) => {
    console.error('测试中断：', e.message)
    if (mp) mp.disconnect()
    results.push({ name: '测试运行', ok: false, err: e.message })
  })
  .finally(() => {
    const fail = results.filter((r) => !r.ok)
    console.log(`\n共 ${results.length} 项，通过 ${results.length - fail.length}，失败 ${fail.length}`)
    process.exit(fail.length ? 1 : 0)
  })
