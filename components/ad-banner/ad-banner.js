Component({
  data: {
    adUnitId: '',
    showAd: false
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const adUnitId = app.globalData.adUnitIds.banner
      if (adUnitId) {
        this.setData({ adUnitId, showAd: true })
      }
    }
  },

  methods: {
    onAdError() {
      this.setData({ showAd: false })
    }
  }
})
