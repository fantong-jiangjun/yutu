const { getAllWheels, getActiveWheelId, setActiveWheel, deleteWheel, createWheel } = require('../../utils/food-wheel-storage')
const { buildShareMessage } = require('../../utils/share')

Page({
  onShareAppMessage() {
    return buildShareMessage('宇图助手 - 今天吃什么随机转盘')
  },

  data: {
    wheels: [],
    activeId: ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    this.setData({
      wheels: getAllWheels(),
      activeId: getActiveWheelId()
    })
  },

  noop() {},

  onSelect(e) {
    const { id } = e.currentTarget.dataset
    setActiveWheel(id)
    this.setData({ activeId: id })
    wx.showToast({ title: '已切换转盘', icon: 'success' })
  },

  onEdit(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/eat-edit/eat-edit?id=${id}` })
  },

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '删除转盘',
      content: `确定删除「${name}」？`,
      success: (res) => {
        if (!res.confirm) return
        const result = deleteWheel(id)
        if (!result.ok) {
          wx.showToast({ title: result.msg, icon: 'none' })
          return
        }
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  onCreate() {
    wx.showModal({
      title: '新建转盘',
      editable: true,
      placeholderText: '如：公司楼下、家附近',
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim() || '我的转盘'
        const wheel = createWheel(name, ['选项一', '选项二', '选项三'])
        setActiveWheel(wheel.id)
        wx.navigateTo({ url: `/pages/eat-edit/eat-edit?id=${wheel.id}` })
      }
    })
  }
})
