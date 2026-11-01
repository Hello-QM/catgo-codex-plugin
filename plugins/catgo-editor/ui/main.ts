import { mount } from 'svelte'
import '$lib/theme/themes.js'
import { apply_theme_to_dom } from '$lib/theme'
import Editor from './Editor.svelte'

// The host picks light or dark (host.ts sets color-scheme). CatGo's components
// read CatGo theme variables, which only its theme table defines; without them
// their dark-only fallbacks show on light pages.
const root = document.documentElement
let theme: 'light' | 'dark' | undefined
const applyTheme = () => {
  const next = root.style.colorScheme === 'dark' ? 'dark' : 'light'
  if (next !== theme) apply_theme_to_dom(theme = next)
}
applyTheme()
new MutationObserver(applyTheme).observe(root, {attributes: true, attributeFilter: ['style']})
mount(Editor, {target: document.getElementById('app')!})
