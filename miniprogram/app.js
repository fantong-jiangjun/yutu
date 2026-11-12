const adConfig = require('./config/ad-config')

App({
  globalData: {
    adUnitIds: {
      banner: adConfig.banner || '',
      rewarded: adConfig.rewarded || ''
    }
  },

  onLaunch() {}
})
