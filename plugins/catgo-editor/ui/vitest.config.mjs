import {defineConfig} from 'vitest/config'
import {fileURLToPath} from 'node:url'

// Keep the retained upstream suite independent of any enclosing checkout's
// Vite/Vitest configuration, including when the repository is nested.
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),
  test:{environment:'happy-dom',include:['.test-build/upstream.test.mjs']},
})
