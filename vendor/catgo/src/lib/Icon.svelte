<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements'
  import { icon_data, type IconName } from './icons'

  let { icon, ...rest }: { icon: IconName } & SVGAttributes<SVGSVGElement> = $props()

  const { path, ...svg_props } = $derived.by(() => {
    if (!(icon in icon_data)) {
      console.error(`Icon '${icon}' not found`)
      return icon_data.Alert // fallback
    }
    return icon_data[icon]
  })
</script>

<svg role="img" fill="currentColor" {...svg_props} {...rest}>
  {#if path.trim().startsWith(`<`)}
    {@html path}
  {:else}
    <path d={path} />
  {/if}
</svg>

<style>
  svg {
    width: 1em;
    /* Explicit height (not `auto`): iOS WKWebView fails to derive an inline
       SVG's intrinsic height from its viewBox when height is `auto` and the
       element carries no width/height attributes — it collapses to 0px and
       renders as an empty/blank square. All icon viewBoxes are square; the
       default preserveAspectRatio keeps any non-square art centered. */
    height: 1em;
    display: inline-block;
    vertical-align: middle;
  }
</style>
