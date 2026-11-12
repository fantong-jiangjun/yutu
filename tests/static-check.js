/**
 * 静态完整性检查：node tests/static-check.js
 * - app.json 中每个页面的 js/json/wxml/wxss 是否齐全
 * - 所有 JSON 能否解析，usingComponents 是否存在
 * - 所有 require() 路径能否解析
 * - WXML 中 bind/catch 事件是否都有对应方法
 * - WXML 中引用的本地图片是否存在
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP = path.join(ROOT, 'miniprogram')
const errors = []
const warns = []
let checks = 0

function ok(cond, msg) {
  checks++
  if (!cond) errors.push(msg)
}

function walk(dir, ext, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, ext, out)
    else if (p.endsWith(ext)) out.push(p)
  }
  return out
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

// ---- JSON
for (const f of walk(MP, '.json').concat(walk(path.join(ROOT, 'cloudfunctions'), '.json'), [path.join(ROOT, 'project.config.json')])) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); checks++ } catch (e) { errors.push(`JSON 解析失败 ${rel(f)}: ${e.message}`) }
}

const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'))
const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
ok(project.miniprogramRoot === 'miniprogram/', 'project.config.json miniprogramRoot 应为 miniprogram/')
ok(project.cloudfunctionRoot === 'cloudfunctions/', 'project.config.json cloudfunctionRoot 应为 cloudfunctions/')
ok(fs.existsSync(path.join(MP, app.sitemapLocation)), 'sitemap.json 不存在')

// ---- 页面四件套 + 组件
const units = app.pages.map((p) => ({ kind: 'page', base: path.join(MP, p) }))
for (const u of units) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    ok(fs.existsSync(u.base + ext), `缺少文件 ${rel(u.base + ext)}`)
  }
  const json = JSON.parse(fs.readFileSync(u.base + '.json', 'utf8'))
  for (const [name, cp] of Object.entries(json.usingComponents || {})) {
    const cbase = cp.startsWith('/') ? path.join(MP, cp) : path.resolve(path.dirname(u.base), cp)
    ok(fs.existsSync(cbase + '.js'), `${rel(u.base)} 引用的组件 ${name} 不存在`)
    if (!units.some((x) => x.base === cbase)) units.push({ kind: 'component', base: cbase })
  }
}

// 页面目录中多余（未注册）的页面
for (const dir of fs.readdirSync(path.join(MP, 'pages'))) {
  const registered = app.pages.some((p) => p.startsWith(`pages/${dir}/`))
  if (!registered) warns.push(`pages/${dir} 未在 app.json 注册`)
}

// ---- require 解析
for (const f of walk(MP, '.js')) {
  const src = fs.readFileSync(f, 'utf8')
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g
  let m
  while ((m = re.exec(src))) {
    const target = path.resolve(path.dirname(f), m[1])
    ok(fs.existsSync(target) || fs.existsSync(target + '.js'), `${rel(f)} require 无法解析: ${m[1]}`)
  }
}

// ---- 加载页面 JS，拿到方法表
const noop = () => {}
const wxStub = new Proxy({}, {
  get: (t, k) => (k === 'env' ? { USER_DATA_PATH: 'wxfile://usr' } : k === 'cloud' ? undefined
    : k === 'getFileSystemManager' ? () => new Proxy({}, { get: () => noop }) : noop)
})
global.wx = wxStub
global.getApp = () => ({ globalData: { adUnitIds: {} } })
let captured = null
global.Page = (o) => { captured = { ...o } }
global.Component = (o) => { captured = { ...(o.methods || {}), __props: o.properties || {} } }

for (const u of units) {
  captured = null
  try {
    delete require.cache[require.resolve(u.base + '.js')]
    require(u.base + '.js')
  } catch (e) {
    errors.push(`${rel(u.base)}.js 加载失败: ${e.message}`)
    continue
  }
  ok(captured, `${rel(u.base)}.js 未调用 ${u.kind === 'page' ? 'Page' : 'Component'}()`)
  if (!captured) continue

  const wxml = fs.readFileSync(u.base + '.wxml', 'utf8')
  const evRe = /\b(?:bind|catch|capture-bind|capture-catch|mut-bind)(?::)?([a-z]+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = evRe.exec(wxml))) {
    const handler = m[2].trim()
    if (!handler || handler.includes('{{')) continue
    ok(typeof captured[handler] === 'function', `${rel(u.base)}.wxml 事件 ${m[1]}="${handler}" 没有对应方法`)
  }
  // 本地图片
  const srcRe = /\bsrc\s*=\s*"([^"{}]+)"/g
  while ((m = srcRe.exec(wxml))) {
    const s = m[1]
    if (/^(https?:|data:|wxfile:)/.test(s)) continue
    const p = s.startsWith('/') ? path.join(MP, s) : path.resolve(path.dirname(u.base), s)
    ok(fs.existsSync(p), `${rel(u.base)}.wxml 图片不存在: ${s}`)
  }
  // 页面分享
  if (u.kind === 'page') {
    ok(typeof captured.onShareAppMessage === 'function', `${rel(u.base)} 缺少 onShareAppMessage`)
  }
}

// ---- 云函数
const cf = path.join(ROOT, 'cloudfunctions', 'secCheck')
for (const f of ['index.js', 'package.json', 'config.json']) ok(fs.existsSync(path.join(cf, f)), `云函数缺少 ${f}`)
const cfg = JSON.parse(fs.readFileSync(path.join(cf, 'config.json'), 'utf8'))
for (const api of ['security.msgSecCheck', 'security.imgSecCheck', 'security.mediaCheckAsync']) {
  ok(cfg.permissions.openapi.includes(api), `云函数 config.json 缺少 openapi 权限 ${api}`)
}

// ---- README 链接
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const linkRe = /\]\((\.\/[^)#\s]+)\)/g
let lm
while ((lm = linkRe.exec(readme))) {
  ok(fs.existsSync(path.join(ROOT, lm[1])), `README 链接失效: ${lm[1]}`)
}

console.log(`静态检查 ${checks} 项，错误 ${errors.length}，警告 ${warns.length}`)
warns.forEach((w) => console.log('  [WARN]', w))
errors.forEach((e) => console.log('  [FAIL]', e))
process.exit(errors.length ? 1 : 0)
