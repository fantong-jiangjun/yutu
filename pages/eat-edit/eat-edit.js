const { getWheel, upsertWheel, resetDefaultWheel } = require('../../utils/food-wheel-storage')

const RESET_HINTS = {
  default: '将默认转盘恢复为全国连锁品牌列表，自定义修改会被覆盖',
  'default-food': '将默认转盘恢复为吃的选项列表，自定义修改会被覆盖',
  'default-drink': '将默认转盘恢复为喝的选项列表，自定义修改会被覆盖'
}

Page({
  data: {
    wheelId: '',
    name: '',
    items: [],
    newItem: '',
    builtIn: false,
    resetHint: '',
    resetLabel: ''
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    const wheel = getWheel(id)
    if (!wheel) {
      wx.showToast({ title: '转盘不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    this.setData({
      wheelId: wheel.id,
      name: wheel.name,
      items: wheel.items,
      builtIn: wheel.builtIn,
      resetHint: RESET_HINTS[wheel.id] || '将默认转盘恢复为初始选项列表，自定义修改会被覆盖',
      resetLabel: wheel.builtIn ? `恢复${wheel.name}列表` : ''
    })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onNewItemInput(e) {
    this.setData({ newItem: e.detail.value })
  },

  onAddItem() {
    const text = (this.data.newItem || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    if (this.data.items.includes(text)) {
      wx.showToast({ title: '已存在', icon: 'none' })
      return
    }
    this.setData({
      items: [...this.data.items, text],
      newItem: ''
    })
  },

  onRemoveItem(e) {
    const index = e.currentTarget.dataset.index
    const items = [...this.data.items]
    items.splice(index, 1)
    this.setData({ items })
  },

  onSave() {
    const name = (this.data.name || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写转盘名称', icon: 'none' })
      return
    }
    if (this.data.items.length < 2) {
      wx.showToast({ title: '至少保留 2 个选项', icon: 'none' })
      return
    }
    upsertWheel({
      id: this.data.wheelId,
      name,
      items: this.data.items,
      builtIn: this.data.builtIn
    })
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 400)
  },

  onResetDefault() {
    wx.showModal({
      title: '恢复默认',
      content: this.data.resetHint,
      success: (res) => {
        if (!res.confirm) return
        const wheel = resetDefaultWheel(this.data.wheelId)
        if (!wheel) return
        this.setData({
          name: wheel.name,
          items: wheel.items
        })
        wx.showToast({ title: '已恢复', icon: 'success' })
      }
    })
  }
})
