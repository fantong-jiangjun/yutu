const COLORS = [
  '#FF6B6B', '#FF922B', '#FFD43B', '#69DB7C', '#38D9A9',
  '#4DABF7', '#748FFC', '#DA77F2', '#F783AC', '#FFA8A8',
  '#FFC078', '#FFE066', '#8CE99A', '#63E6BE', '#74C0FC',
  '#91A7FF', '#E599F7', '#FFB3C1', '#FD7E14', '#20C997'
]

function pickColor(i) {
  return COLORS[i % COLORS.length]
}

function getWheelLayout(n) {
  let wheelSize = 600
  let fontSize = 28
  let labelTop = 18

  if (n <= 8) {
    wheelSize = 580
    fontSize = 34
    labelTop = 16
  } else if (n <= 16) {
    wheelSize = 620
    fontSize = 28
    labelTop = 20
  } else if (n <= 24) {
    wheelSize = 660
    fontSize = 26
    labelTop = 26
  } else {
    wheelSize = 680
    fontSize = 24
    labelTop = 30
  }

  if (n >= 100) fontSize = 20

  return { wheelSize, fontSize, labelTop }
}

/** 构建转盘扇区：盘面上显示序号 1、2、3… */
function buildWheelSlices(items) {
  const n = items.length
  if (n === 0) {
    return { slices: [], sliceDeg: 0, wheelSize: 600, fontSize: 28, labelTop: 24 }
  }

  const sliceDeg = 360 / n
  const skewInner = 90 - sliceDeg
  const layout = getWheelLayout(n)

  const slices = items.map((name, i) => ({
    color: pickColor(i),
    rotate: i * sliceDeg,
    skewInner,
    skewNeg: sliceDeg - 90,
    textRotate: sliceDeg / 2,
    num: i + 1,
    name: String(name)
  }))

  return { slices, sliceDeg, ...layout }
}

/** 计算旋转角度，指针在顶部 12 点方向 */
function calcSpinRotation(currentRotation, index, count) {
  const sliceDeg = 360 / count
  const extraTurns = 5 + Math.floor(Math.random() * 3)
  const targetMod = (360 - index * sliceDeg - sliceDeg / 2 + 360) % 360
  const currentMod = ((currentRotation % 360) + 360) % 360
  let delta = extraTurns * 360 + targetMod - currentMod
  if (delta < extraTurns * 360) delta += 360
  return currentRotation + delta
}

module.exports = {
  pickColor,
  buildWheelSlices,
  calcSpinRotation
}
