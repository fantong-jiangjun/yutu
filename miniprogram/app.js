const adConfig = require('./config/ad-config')
const { initCloud } = require('./utils/sec-check')

App({
  globalData: {
    adUnitIds: {
      banner: adConfig.banner || '',
      rewarded: adConfig.rewarded || ''
    }
  },

  onLaunch() {
    initCloud()
  }
})
