const { getActiveWheel, getAllWheels, setActiveWheel } = require('../../utils/food-wheel-storage')
const { buildWheelSlices, calcSpinRotation } = require('../../utils/food-wheel-draw')

Page({
  data: {
    wheelId: '',
    wheelName: '',
    items: [],
    itemCount: 0,
    slices: [],
    wheelSize: 600,
    fontSize: 28,
    labelTop: 24,
    rotation: 0,
    spinning: false,
    spinDuration: 4500,
    result: '',
    resultName: '',
    resultNum: 0
  },

  onShow() {
    this.loadWheel()
  },

  loadWheel() {
    const wheel = getActiveWheel()
    const layout = buildWheelSlices(wheel.items)
    this.setData({
      wheelId: wheel.id,
      wheelName: wheel.name,
      items: wheel.items,
      itemCount: wheel.items.length,
      slices: layout.slices,
      wheelSize: layout.wheelSize,
      fontSize: layout.fontSize,
      labelTop: layout.labelTop,
      result: ''
    })
  },

  openWheelPicker() {
    const wheels = getAllWheels()
    wx.showActionSheet({
      itemList: wheels.map((w) => `${w.name}（${w.items.length}项）`),
      success: (res) => {
        const picked = wheels[res.tapIndex]
        if (picked.id === this.data.wheelId) return
        setActiveWheel(picked.id)
        this.setData({ rotation: 0, result: '', resultName: '', resultNum: 0, spinning: false })
        this.loadWheel()
      }
    })
  },

  onSpin() {
    const { items, spinning, rotation } = this.data
    if (spinning || items.length < 2) return

    const index = Math.floor(Math.random() * items.length)
    const nextRotation = calcSpinRotation(rotation, index, items.length)

    this.setData({
      spinning: false,
      result: '',
      resultName: '',
      resultNum: 0
    })

    wx.nextTick(() => {
      this.setData({
        spinning: true,
        spinDuration: 4500,
        rotation: nextRotation
      })

      setTimeout(() => {
        this.setData({
          spinning: false,
          result: items[index],
          resultName: items[index],
          resultNum: index + 1
        })
      }, 4600)
    })
  },

  goManage() {
    wx.navigateTo({ url: '/pages/eat-manage/eat-manage' })
  },

  goEdit() {
    wx.navigateTo({ url: `/pages/eat-edit/eat-edit?id=${this.data.wheelId}` })
  }
})
