import type { AnyStructure } from '$lib/structure'

/** Restore explicit movement metadata omitted by the retained XYZ parser.
 * Coordinates/species/cell still come from that parser; offsets come from
 * the file's declared Properties layout, never from trailing-column guesses. */
export function restoreXyzProperties(structure: AnyStructure, text: string): void {
  const lines = text.trimStart().split(/\r?\n/)
  const match = lines[1]?.match(/\bProperties\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i)
  if (!match) return
  const parts = (match[1] ?? match[2] ?? match[3]).replace(/\s+/g,':').split(':')
  if (parts.length % 3) throw new Error('Invalid extXYZ Properties layout.')
  const fields = new Map<string,number>()
  let maskWidth = 0, integerMask = false
  let offset = 0
  for (let index=0;index<parts.length;index+=3) {
    const name = parts[index].toLowerCase(), type = parts[index+1].toUpperCase(), count = Number(parts[index+2])
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(offset+count)) throw new Error('Invalid extXYZ property column count.')
    const key = name === 'forces' ? 'force' : name
    if (['selective_dynamics','move_mask','force'].includes(key)) {
      const valid = key === 'force' ? count === 3 && ['R','I'].includes(type)
        : key === 'move_mask' ? [1,3].includes(count) && ['L','I'].includes(type)
        : type === 'L' && count === 3
      if (!valid || fields.has(key)) throw new Error('Invalid or duplicate extXYZ movement/force property.')
      fields.set(key,offset)
      if (key === 'move_mask') { maskWidth = count; integerMask = type === 'I' }
    }
    offset += count
  }
  const logical = (token: string | undefined, atom: number, integer = false): boolean => {
    if (integer && !/^[01]$/.test(token ?? '')) throw new Error(`Invalid extXYZ integer movement constraint at atom ${atom+1}.`)
    if (/^(T|true|1)$/i.test(token ?? '')) return true
    if (/^(F|false|0)$/i.test(token ?? '')) return false
    throw new Error(`Invalid extXYZ logical movement constraint at atom ${atom+1}.`)
  }
  structure.sites.forEach((site,index) => {
    const values = lines[index+2]?.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? []
    const selective = fields.get('selective_dynamics'), mask = fields.get('move_mask'), force = fields.get('force')
    const axes = selective === undefined ? undefined : [0,1,2].map(axis=>logical(values[selective+axis],index))
    const maskAxes = mask === undefined || maskWidth !== 3 ? undefined : [0,1,2].map(axis=>logical(values[mask+axis],index,integerMask))
    const movable = mask === undefined || maskWidth !== 1 ? undefined : logical(values[mask],index,integerMask)
    if (axes && maskAxes && axes.some((free,axis)=>free !== maskAxes[axis])) throw new Error(`Contradictory extXYZ movement constraints at atom ${index+1}.`)
    const effectiveAxes = axes ?? maskAxes
    if (effectiveAxes && movable !== undefined && effectiveAxes.some(Boolean) !== movable) throw new Error(`Contradictory extXYZ movement constraints at atom ${index+1}.`)
    if (effectiveAxes || movable !== undefined) {
      site.properties.selective_dynamics = effectiveAxes ?? [movable,movable,movable]
      site.properties.move_mask = movable ?? effectiveAxes!.some(Boolean)
    }
    if (force !== undefined) {
      const vector = [0,1,2].map(axis=>Number(values[force+axis]))
      if (!vector.every(Number.isFinite)) throw new Error(`Invalid extXYZ force at atom ${index+1}.`)
      site.properties.force = vector
    } else {
      // Explicit Properties without a force field must not turn numeric
      // logical constraints into the legacy parser's inferred force vector.
      delete site.properties.force
    }
  })
}
