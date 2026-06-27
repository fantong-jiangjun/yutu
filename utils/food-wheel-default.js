/** 默认转盘 · 全国连锁品牌 */
const CHAIN_ITEMS = [
  '华莱士',
  '塔斯汀',
  '蜜雪冰城',
  '瑞幸咖啡',
  '麦当劳',
  '肯德基',
  '杨国福麻辣烫',
  '沙县小吃',
  '杨铭宇黄焖鸡米饭',
  '海底捞',
  '老乡鸡',
  '库迪咖啡',
  '霸王茶姬',
  '甜啦啦',
  '必胜客',
  '益禾堂',
  '古茗',
  '书亦烧仙草',
  '茶百道',
  '沪上阿姨',
  '喜茶',
  '星巴克',
  '幸运咖',
  'Manner',
  '挪瓦咖啡',
  'Tims天好咖啡',
  '正新鸡排',
  '绝味鸭脖',
  '紫燕百味鸡',
  '周黑鸭'
]

/** 默认转盘 · 吃的 */
const FOOD_ITEMS = [
  '华莱士',
  '塔斯汀',
  '麦当劳',
  '肯德基',
  '杨国福麻辣烫',
  '沙县小吃',
  '杨铭宇黄焖鸡米饭',
  '海底捞',
  '老乡鸡',
  '必胜客',
  '正新鸡排',
  '绝味鸭脖',
  '紫燕百味鸡',
  '周黑鸭',
  '黄焖鸡米饭',
  '兰州拉面',
  '重庆小面',
  '盖浇饭',
  '饺子',
  '麻辣烫'
]

/** 默认转盘 · 喝的 */
const DRINK_ITEMS = [
  '蜜雪冰城',
  '瑞幸咖啡',
  '库迪咖啡',
  '霸王茶姬',
  '甜啦啦',
  '益禾堂',
  '古茗',
  '书亦烧仙草',
  '茶百道',
  '沪上阿姨',
  '喜茶',
  '星巴克',
  '幸运咖',
  'Manner',
  '挪瓦咖啡',
  'Tims天好咖啡',
  'CoCo都可',
  '一点点',
  '奈雪的茶',
  '乐乐茶'
]

const DEFAULT_WHEEL = {
  id: 'default',
  name: '默认·全国连锁',
  items: CHAIN_ITEMS,
  builtIn: true
}

const FOOD_WHEEL = {
  id: 'default-food',
  name: '默认·吃的',
  items: FOOD_ITEMS,
  builtIn: true
}

const DRINK_WHEEL = {
  id: 'default-drink',
  name: '默认·喝的',
  items: DRINK_ITEMS,
  builtIn: true
}

const BUILTIN_WHEELS = [DEFAULT_WHEEL, FOOD_WHEEL, DRINK_WHEEL]

const BUILTIN_WHEEL_MAP = BUILTIN_WHEELS.reduce((map, wheel) => {
  map[wheel.id] = wheel
  return map
}, {})

module.exports = {
  CHAIN_ITEMS,
  FOOD_ITEMS,
  DRINK_ITEMS,
  DEFAULT_ITEMS: CHAIN_ITEMS,
  DEFAULT_WHEEL,
  FOOD_WHEEL,
  DRINK_WHEEL,
  BUILTIN_WHEELS,
  BUILTIN_WHEEL_MAP
}
