import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export async function checkUpstreamUpdates() {
  const sourceRoot = process.env.CATGO_SOURCE_ROOT || resolve(pluginRoot, '../../vendor/catgo')
  const reference = JSON.parse(await readFile(resolve(pluginRoot, 'references/catgo-dev-updates.json'), 'utf8'))
  for (const [file, expected] of Object.entries(reference.files)) {
    const actual = createHash('sha256').update(await readFile(resolve(sourceRoot, file))).digest('hex')
    if (actual !== expected) throw new Error(`Review upstream fix changes before packaging: ${file}`)
  }
  return { repository: reference.repository, commits: reference.commits,
    reviewedUpstreamHead: reference.reviewedUpstreamHead,
    sourceChecks: Object.keys(reference.files).length }
}
