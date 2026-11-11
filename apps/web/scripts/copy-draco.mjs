// Copies the Draco decoder from the installed three package into public/draco, so the app
// serves the decoder itself and the files always match the installed three version.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// The glTF build of the decoder is the one GLTFLoader needs.
const source = dirname(require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js'))
const target = fileURLToPath(new URL('../public/draco', import.meta.url))

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })

console.log(`Copied Draco decoder to ${target}`)
