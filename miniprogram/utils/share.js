const DEFAULT_TITLE = '宇图助手 - 图片处理、PDF、二维码等实用工具'
const HOME_PATH = '/pages/index/index'

function buildShareMessage(title = DEFAULT_TITLE) {
  return {
    title,
    path: HOME_PATH
  }
}

module.exports = {
  buildShareMessage
}
