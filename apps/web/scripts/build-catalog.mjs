// Writes src/catalog/manifest.json from src/catalog/sources.json. Each model's size is measured
// from its GLB file and multiplied by the source list's scale, so no size is typed by hand.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const sources = JSON.parse(readFileSync(new URL('src/catalog/sources.json', root), 'utf8'))
const publicDir = new URL('public/', root)

const items = sources.items.map(({ key, file, name, category, placement = 'floor' }) => {
  const base = `${sources.folder}/${file}`
  const size = measureGlb(new URL(`.${base}.glb`, publicDir))
  const metres = (value) => Math.round(value * sources.scale * 100) / 100
  return {
    key,
    name,
    category,
    model: `${base}.glb`,
    thumbnail: `${base}.png`,
    size: { width: metres(size.x), height: metres(size.y), depth: metres(size.z) },
    placement,
  }
})

const target = new URL('src/catalog/manifest.json', root)
writeFileSync(target, JSON.stringify({ items }, null, 2) + '\n')
console.log(`Wrote ${items.length} items to ${fileURLToPath(target)}`)

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
