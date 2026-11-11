// Writes src/catalog/manifest.json from src/catalog/sources.json. Each model's size is measured
// from its GLB file and multiplied by the source list's scale, so no size is typed by hand.
// Its outline on the floor is measured too, unless the source list gives one.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const sources = JSON.parse(readFileSync(new URL('src/catalog/sources.json', root), 'utf8'))
const publicDir = new URL('public/', root)

/** A measured outline has at most this many corners. */
const MAX_FOOTPRINT_POINTS = 12
/** An outline that fills this much of the item's rectangle is left out: the rectangle will do. */
const RECTANGLE_ENOUGH = 0.97

const items = sources.items.map(({ key, file, name, category, placement = 'floor', footprint }) => {
  const base = `${sources.folder}/${file}`
  const url = new URL(`.${base}.glb`, publicDir)
  const size = measureGlb(url)
  // An outline written in the source list wins: an L shape cannot be measured as one convex piece.
  const outline = footprint ?? measureFootprint(url)
  const metres = (value) => Math.round(value * sources.scale * 100) / 100
  return {
    key,
    name,
    category,
    model: `${base}.glb`,
    thumbnail: `${base}.png`,
    size: { width: metres(size.x), height: metres(size.y), depth: metres(size.z) },
    placement,
    ...(outline && { footprint: outline }),
  }
})

const target = new URL('src/catalog/manifest.json', root)
writeFileSync(target, formatManifest(items))
const shaped = items.filter((item) => item.footprint).length
console.log(`Wrote ${items.length} items (${shaped} with a footprint) to ${fileURLToPath(target)}`)

/** The manifest as JSON, with each footprint piece on one line so the file stays readable. */
function formatManifest(items) {
  const pieces = []
  const withMarkers = items.map((item) =>
    item.footprint
      ? { ...item, footprint: item.footprint.map((piece) => `@piece${pieces.push(piece) - 1}@`) }
      : item,
  )
  const json = JSON.stringify({ items: withMarkers }, null, 2)
  return json.replace(/"@piece(\d+)@"/g, (_, index) => JSON.stringify(pieces[index])) + '\n'
}

/**
 * The model's outline on the floor: the convex hull of its vertices seen from above, as one
 * footprint piece in the item's own frame (x across the width, y from front to back, both from
 * -0.5 to 0.5, counter-clockwise). Returns `undefined` when the hull all but fills the rectangle.
 */
function measureFootprint(url) {
  const vertices = readVertices(url)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, , z] of vertices) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  // The plan's y axis is the scene's -z, so the model's depth is mirrored here.
  const points = vertices.map(([x, , z]) => [
    (x - (minX + maxX) / 2) / (maxX - minX),
    -(z - (minZ + maxZ) / 2) / (maxZ - minZ),
  ])
  let hull = convexHull(points)
  while (hull.length > MAX_FOOTPRINT_POINTS) hull = withoutSmallestCorner(hull)
  hull = convexHull(hull.map(([x, y]) => [round3(x), round3(y)]))
  if (hull.length < 3 || polygonArea(hull) >= RECTANGLE_ENOUGH) return undefined
  return [hull]
}

/** To three decimals, and never outside the item's rectangle. */
function round3(value) {
  return Math.round(Math.min(0.5, Math.max(-0.5, value)) * 1000) / 1000
}

/** Andrew's monotone chain. Counter-clockwise, without points on a straight edge. */
function convexHull(points) {
  const sorted = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  )
  if (sorted.length < 3) return sorted
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list) => {
    const chain = []
    for (const p of list) {
      while (chain.length >= 2 && turn(chain.at(-2), chain.at(-1), p) <= 1e-9) chain.pop()
      chain.push(p)
    }
    chain.pop()
    return chain
  }
  return [...half(sorted), ...half(sorted.reverse())]
}

function polygonArea(polygon) {
  let sum = 0
  polygon.forEach(([x, y], i) => {
    const [nextX, nextY] = polygon[(i + 1) % polygon.length]
    sum += x * nextY - nextX * y
  })
  return sum / 2
}

/** Drops the corner whose removal changes the outline least. */
function withoutSmallestCorner(polygon) {
  let smallest = 0
  let smallestArea = Infinity
  polygon.forEach((point, i) => {
    const before = polygon[(i - 1 + polygon.length) % polygon.length]
    const after = polygon[(i + 1) % polygon.length]
    const area = Math.abs(polygonArea([before, point, after]))
    if (area < smallestArea) {
      smallest = i
      smallestArea = area
    }
  })
  return polygon.filter((_, i) => i !== smallest)
}

/** Every vertex position in a GLB model, moved by the node transforms into the model's space. */
function readVertices(url) {
  const buffer = readFileSync(url)
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))
  const binStart = 20 + jsonLength + 8
  const vertices = []

  const visit = (index, parent) => {
    const node = json.nodes[index]
    const matrix = multiply(parent, localMatrix(node))
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION]
        if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
          throw new Error(`${url.pathname}: vertex positions are not 32-bit float triples`)
        }
        const view = json.bufferViews[accessor.bufferView]
        const start = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
        const stride = view.byteStride ?? 12
        for (let i = 0; i < accessor.count; i++) {
          const p = [0, 4, 8].map((offset) => buffer.readFloatLE(start + i * stride + offset))
          vertices.push(
            [0, 1, 2].map(
              (axis) =>
                matrix[axis] * p[0] +
                matrix[4 + axis] * p[1] +
                matrix[8 + axis] * p[2] +
                matrix[12 + axis],
            ),
          )
        }
      }
    }
    for (const child of node.children ?? []) visit(child, matrix)
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  for (const rootNode of json.scenes[json.scene ?? 0].nodes) visit(rootNode, identity)
  return vertices
}

/**
 * The size of a GLB model's bounding box in its own units: the box of every mesh's positions,
 * moved by the node transforms. Three.js's `Box3.setFromObject()` measures the same way.
 */
function measureGlb(url) {
  const buffer = readFileSync(url)
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${url.pathname} is not a GLB file`)
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'))
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  const visit = (index, parent) => {
    const node = json.nodes[index]
    const matrix = multiply(parent, localMatrix(node))
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION]
        // The eight corners of the primitive's own box, moved into the model's space.
        for (let corner = 0; corner < 8; corner++) {
          const p = [0, 1, 2].map((axis) =>
            (corner >> axis) & 1 ? accessor.max[axis] : accessor.min[axis],
          )
          for (let axis = 0; axis < 3; axis++) {
            const value =
              matrix[axis] * p[0] +
              matrix[4 + axis] * p[1] +
              matrix[8 + axis] * p[2] +
              matrix[12 + axis]
            min[axis] = Math.min(min[axis], value)
            max[axis] = Math.max(max[axis], value)
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, matrix)
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  for (const rootNode of json.scenes[json.scene ?? 0].nodes) visit(rootNode, identity)
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }
}

/** A node's transform as a column-major 4×4 matrix, as glTF stores it. */
function localMatrix(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  // prettier-ignore
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function multiply(a, b) {
  const result = new Array(16).fill(0)
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
    }
  }
  return result
}
