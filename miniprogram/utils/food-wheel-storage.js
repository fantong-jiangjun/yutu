const { DEFAULT_WHEEL, DEFAULT_ITEMS, BUILTIN_WHEELS, BUILTIN_WHEEL_MAP } = require('./food-wheel-default')

const STORAGE_KEY = 'food_wheels_v1'

function uid() {
  return 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function cloneWheel(wheel) {
  return {
    id: wheel.id,
    name: wheel.name,
    items: [...wheel.items],
    builtIn: !!wheel.builtIn
  }
}

function createInitialState() {
  return {
    activeWheelId: DEFAULT_WHEEL.id,
    wheels: BUILTIN_WHEELS.map(cloneWheel)
  }
}

function ensureBuiltinWheels(state) {
  let changed = false
  BUILTIN_WHEELS.forEach((builtin) => {
    if (!state.wheels.some((w) => w.id === builtin.id)) {
      state.wheels.unshift(cloneWheel(builtin))
      changed = true
    }
  })
  if (changed) saveState(state)
  return state
}

function loadState() {
  try {
    const state = wx.getStorageSync(STORAGE_KEY)
    if (state && Array.isArray(state.wheels) && state.wheels.length) {
      return ensureBuiltinWheels(state)
    }
  } catch (e) { /* ignore */ }
  const initial = createInitialState()
  saveState(initial)
  return initial
}

function saveState(state) {
  wx.setStorageSync(STORAGE_KEY, state)
}

function getAllWheels() {
  return loadState().wheels.map(cloneWheel)
}

function getActiveWheelId() {
  return loadState().activeWheelId
}

function getWheel(id) {
  const wheel = loadState().wheels.find((w) => w.id === id)
  return wheel ? cloneWheel(wheel) : null
}

function getActiveWheel() {
  const state = loadState()
  const wheel = state.wheels.find((w) => w.id === state.activeWheelId)
  return wheel ? cloneWheel(wheel) : cloneWheel(state.wheels[0])
}

function setActiveWheel(id) {
  const state = loadState()
  if (!state.wheels.some((w) => w.id === id)) return false
  state.activeWheelId = id
  saveState(state)
  return true
}

function upsertWheel(wheel) {
  const state = loadState()
  const idx = state.wheels.findIndex((w) => w.id === wheel.id)
  const payload = {
    id: wheel.id,
    name: (wheel.name || '').trim() || '未命名转盘',
    items: (wheel.items || []).map((s) => String(s).trim()).filter(Boolean),
    builtIn: !!wheel.builtIn
  }
  if (idx >= 0) {
    if (state.wheels[idx].builtIn) payload.builtIn = true
    state.wheels[idx] = payload
  } else {
    state.wheels.push(payload)
  }
  saveState(state)
  return cloneWheel(payload)
}

function createWheel(name, items) {
  return upsertWheel({
    id: uid(),
    name: name || '我的转盘',
    items: items && items.length ? items : ['选项一', '选项二'],
    builtIn: false
  })
}

function deleteWheel(id) {
  if (BUILTIN_WHEEL_MAP[id]) return { ok: false, msg: '默认转盘不能删除' }
  const state = loadState()
  const idx = state.wheels.findIndex((w) => w.id === id)
  if (idx < 0) return { ok: false, msg: '转盘不存在' }
  state.wheels.splice(idx, 1)
  if (state.activeWheelId === id) {
    state.activeWheelId = state.wheels[0].id
  }
  saveState(state)
  return { ok: true }
}

function resetDefaultWheel(id = DEFAULT_WHEEL.id) {
  const template = BUILTIN_WHEEL_MAP[id]
  if (!template) return null
  const state = loadState()
  const idx = state.wheels.findIndex((w) => w.id === id)
  const fresh = cloneWheel(template)
  if (idx >= 0) state.wheels[idx] = fresh
  else state.wheels.unshift(fresh)
  saveState(state)
  return fresh
}

module.exports = {
  DEFAULT_ITEMS,
  getAllWheels,
  getActiveWheelId,
  getActiveWheel,
  getWheel,
  setActiveWheel,
  upsertWheel,
  createWheel,
  deleteWheel,
  resetDefaultWheel
}
