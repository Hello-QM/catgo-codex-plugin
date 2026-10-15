import { describe, expect, it, vi } from 'vitest'
import { parse_cp2k, parse_structure_file } from '$lib/structure/parse'

const antiferromagnetic = `&FORCE_EVAL
  &DFT
    UKS T
    MULTIPLICITY 1
  &END DFT
  &SUBSYS
    &CELL
      ABC 8 8 20
    &END CELL
    &COORD
      Ni1 1 1 4
      O   2 1 4
      Ni2 3 1 4
      O   4 1 4
      Ni1 5 1 4
      Ni2 6 1 4
    &END COORD
    &KIND Ni1
      ELEMENT Ni
      MAGNETIZATION 2.0
    &END KIND
    &KIND Ni2
      ELEMENT Ni
      MAGNETIZATION -2.0
    &END KIND
  &END SUBSYS
&END FORCE_EVAL
&MOTION
  &CONSTRAINT
    &FIXED_ATOMS
      COMPONENTS_TO_FIX XYZ
      LIST 1 3
    &END FIXED_ATOMS
    &FIXED_ATOMS
      COMPONENTS_TO_FIX Z
      LIST 5..6
    &END FIXED_ATOMS
    &FIXED_ATOMS
      COMPONENTS_TO_FIX X
      LIST 6
    &END FIXED_ATOMS
  &END CONSTRAINT
&END MOTION`

describe('CP2K named kinds and constraint indices', () => {
  it('keeps Ni1/Ni2 atoms in COORD order and fixes the correct atoms', () => {
    const result = parse_cp2k(antiferromagnetic)!
    expect(result).not.toBeNull()
    expect(result.sites.map(s => s.species[0].element)).toEqual(['Ni', 'O', 'Ni', 'O', 'Ni', 'Ni'])
    expect(result.sites.map(s => s.xyz[0])).toEqual([1, 2, 3, 4, 5, 6])
    expect(result.sites.map(s => s.properties?.selective_dynamics)).toEqual([
      [false, false, false], undefined, [false, false, false], undefined,
      [true, true, false], [false, true, false],
    ])
    expect(result.sites.map(s => s.properties?.cp2k_kind)).toEqual(['Ni1', 'O', 'Ni2', 'O', 'Ni1', 'Ni2'])
    expect(result.sites.map(s => s.properties?.cp2k_magnetization)).toEqual([2, undefined, -2, undefined, 2, -2])
  })

  it.each(['afm.inp', 'afm-1.restart', undefined])('imports named kinds through file detection (%s)', (name) => {
    const result = parse_structure_file(antiferromagnetic, name)!
    expect(result.sites).toHaveLength(6)
    expect(result.sites[2].properties?.selective_dynamics).toEqual([false, false, false])
    expect(result.sites[1].properties?.selective_dynamics).toBeUndefined()
  })

  it('uses explicit ELEMENT for arbitrary kind names and preserves opposite initial moments', () => {
    const input = antiferromagnetic.replaceAll('Ni1', 'spin_up').replaceAll('Ni2', 'spin_down')
    const result = parse_cp2k(input)!
    expect(result.sites).toHaveLength(6)
    expect(result.sites[0].species[0].element).toBe('Ni')
    expect(result.sites[2].species[0].element).toBe('Ni')
    expect(result.sites[0].properties?.cp2k_kind).toBe('spin_up')
    expect(result.sites[2].properties?.cp2k_magnetization).toBe(-2)
  })

  it('handles lower-case keywords, bare END, nested KIND sections and ELEMENT_SYMBOL', () => {
    const result = parse_cp2k(`&force_eval
&subsys
&kind ni1
  element_symbol ni
  magnetization 2.0D+0
  &bs
    &alpha
      nel 2
    &end
  &end
&end
&kind ni2
  element ni
  magnetization -2.0d+0
&end
&coord
  ni1 0 0 0
  ni2 1 0 0
&end
&end
&end
&motion
&constraint
&fixed_atoms
  list 2
&end
&end
&end`)!
    expect(result.sites.map(s => s.species[0].element)).toEqual(['Ni', 'Ni'])
    expect(result.sites.map(s => s.properties?.cp2k_magnetization)).toEqual([2, -2])
    expect(result.sites[0].properties?.selective_dynamics).toBeUndefined()
    expect(result.sites[1].properties?.selective_dynamics).toEqual([false, false, false])
  })

  it('infers numbered element kinds when ELEMENT is omitted', () => {
    const result = parse_cp2k(antiferromagnetic.replaceAll('ELEMENT Ni', ''))!
    expect(result.sites).toHaveLength(6)
    expect(result.sites[2].species[0].element).toBe('Ni')
    expect(result.sites[2].properties?.selective_dynamics).toEqual([false, false, false])
  })

  it('gives explicit ELEMENT priority over a kind name resembling another element', () => {
    const result = parse_cp2k(antiferromagnetic.replaceAll('Ni1', 'Co1'))!
    expect(result.sites[0].species[0].element).toBe('Ni')
    expect(result.sites[0].properties?.cp2k_kind).toBe('Co1')
  })

  it.each(['unknown_kind 0 0 0', 'Ni1 invalid 0 0', 'Ni1 0 0'])('rejects unreadable atoms instead of shifting later constraints (%s)', (row) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(parse_cp2k(antiferromagnetic.replace('Ni1 1 1 4', row))).toBeNull()
    } finally {
      log.mockRestore()
    }
  })
})
