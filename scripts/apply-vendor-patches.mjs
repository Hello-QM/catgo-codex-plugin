import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patch = resolve(root, 'vendor/catgo/patches/three@0.181.2.patch')
const run = args => execFileSync('git', ['apply', '--unidiff-zero',
  '--directory=vendor/catgo/node_modules/three', ...args, patch], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
})
try {
  run(['--check'])
  run([])
  console.log('Applied retained Three.js viewer patch.')
} catch (error) {
  try {
    run(['--reverse', '--check'])
    console.log('Three.js viewer patch already applied.')
  } catch {
    throw error
  }
}
