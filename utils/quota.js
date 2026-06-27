const FREE_SAVE_PER_DAY = 3
const STORAGE_KEY = 'baotu_daily_save'

function getTodayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function getTodaySaveCount() {
  const data = wx.getStorageSync(STORAGE_KEY) || {}
  const today = getTodayKey()
  return data[today] || 0
}

function canSaveFree() {
  return getTodaySaveCount() < FREE_SAVE_PER_DAY
}

function getRemainingFreeSaves() {
  return Math.max(0, FREE_SAVE_PER_DAY - getTodaySaveCount())
}

function recordSave() {
  const data = wx.getStorageSync(STORAGE_KEY) || {}
  const today = getTodayKey()
  data[today] = (data[today] || 0) + 1
  wx.setStorageSync(STORAGE_KEY, data)
}

module.exports = {
  FREE_SAVE_PER_DAY,
  getTodaySaveCount,
  canSaveFree,
  getRemainingFreeSaves,
  recordSave
}
