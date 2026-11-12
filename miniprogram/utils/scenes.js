/** 考试 / 报名场景规格配置 */
const SCENES = {
  cet: {
    id: 'cet',
    name: '四六级',
    shortName: '四六级',
    width: 144,
    height: 192,
    format: 'jpg',
    maxKB: 200,
    aspectRatio: 144 / 192,
    tips: '144×192 像素，JPG，≤200KB'
  },
  kaoyan: {
    id: 'kaoyan',
    name: '考研报名',
    shortName: '考研',
    width: 295,
    height: 413,
    format: 'jpg',
    maxKB: 100,
    aspectRatio: 295 / 413,
    tips: '295×413 像素，JPG，≤100KB'
  },
  jiaozi: {
    id: 'jiaozi',
    name: '教师资格证',
    shortName: '教资',
    width: 295,
    height: 413,
    format: 'jpg',
    maxKB: 200,
    aspectRatio: 295 / 413,
    tips: '295×413 像素，JPG，≤200KB'
  },
  ncce: {
    id: 'ncce',
    name: '计算机等级考试',
    shortName: '计二级',
    width: 390,
    height: 567,
    format: 'jpg',
    maxKB: 200,
    aspectRatio: 390 / 567,
    tips: '390×567 像素，JPG，≤200KB'
  },
  one_inch: {
    id: 'one_inch',
    name: '一寸照',
    shortName: '一寸',
    width: 295,
    height: 413,
    format: 'jpg',
    maxKB: 200,
    aspectRatio: 295 / 413,
    defaultFitMode: 'cover',
    tips: '295×413 像素，JPG，≤200KB，居中裁剪'
  },
  two_inch: {
    id: 'two_inch',
    name: '二寸照',
    shortName: '二寸',
    width: 413,
    height: 579,
    format: 'jpg',
    maxKB: 500,
    aspectRatio: 413 / 579,
    defaultFitMode: 'cover',
    tips: '413×579 像素，JPG，≤500KB，居中裁剪'
  }
}

/** 先传图后选规格：尺寸选项列表 */
const SIZE_OPTIONS = [
  { id: 'one_inch', name: '一寸照', desc: '295×413，居中裁剪无白边' },
  { id: 'two_inch', name: '二寸照', desc: '413×579，居中裁剪无白边' },
  { id: 'size_only', name: '指定体积', desc: '仅压缩体积，不超过你填的 KB' }
]

const SCENE_LIST = Object.values(SCENES)

function getSceneById(id) {
  if (id === 'custom') return null
  const scene = SCENES[id]
  if (!scene) return null
  return { ...scene, checkMode: scene.checkMode || 'full' }
}

function buildCustomScene({ width, height, maxKB, format = 'jpg', name = '自定义' }) {
  const w = parseInt(width, 10)
  const h = parseInt(height, 10)
  const kb = parseInt(maxKB, 10)
  return {
    id: 'custom',
    name,
    shortName: name,
    width: w,
    height: h,
    format: format || 'jpg',
    maxKB: kb,
    aspectRatio: w / h,
    checkMode: 'full',
    exactKB: false,
    tips: `${w}×${h} 像素，${(format || 'jpg').toUpperCase()}，≤${kb}KB`
  }
}

/** 仅限制体积，保持原图尺寸 */
function buildSizeOnlyScene(maxKB, width, height) {
  const kb = parseInt(maxKB, 10)
  const w = parseInt(width, 10)
  const h = parseInt(height, 10)
  return {
    id: 'size_only',
    name: '指定体积',
    shortName: '指定体积',
    width: w,
    height: h,
    format: 'jpg',
    maxKB: kb,
    aspectRatio: w / h,
    checkMode: 'sizeOnly',
    exactKB: false,
    tips: `保持 ${w}×${h}，JPG，≤${kb}KB`
  }
}

/** 目标 KB：用户填写的体积上限，处理时尽量接近但不超出 */
function getTargetKB(scene) {
  return scene.maxKB
}

/** 用户自定义目标体积 KB */
function applyMaxKBToScene(scene, maxKB) {
  const kb = parseInt(maxKB, 10)
  if (!scene || !kb || kb < 10) return null
  if (scene.checkMode === 'sizeOnly') {
    return buildSizeOnlyScene(kb, scene.width, scene.height)
  }
  const format = scene.format || 'jpg'
  return {
    ...scene,
    maxKB: kb,
    exactKB: false,
    tips: scene.checkMode === 'sizeOnly'
      ? `保持 ${scene.width}×${scene.height}，JPG，≤${kb}KB`
      : `${scene.width}×${scene.height} 像素，${format.toUpperCase()}，≤${kb}KB`
  }
}

function getDefaultFitMode(scene) {
  if (!scene || scene.checkMode === 'sizeOnly') return 'contain'
  return scene.defaultFitMode || 'contain'
}

module.exports = {
  SCENES,
  SCENE_LIST,
  SIZE_OPTIONS,
  getSceneById,
  buildCustomScene,
  buildSizeOnlyScene,
  applyMaxKBToScene,
  getTargetKB,
  getDefaultFitMode
}
