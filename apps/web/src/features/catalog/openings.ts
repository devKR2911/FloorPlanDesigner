import type { OpeningKind } from '@floorplandesigner/engine'

/** A door or window the panel can add: a kind with a starting size, in metres. */
export interface OpeningPreset {
  key: string
  name: string
  kind: OpeningKind
  width: number
  height: number
  /** Height of the bottom of the opening above the floor. */
  sill: number
}

export const openingPresets: OpeningPreset[] = [
  { key: 'door', name: 'Door', kind: 'door', width: 0.9, height: 2.1, sill: 0 },
  { key: 'double-door', name: 'Double door', kind: 'door', width: 1.6, height: 2.1, sill: 0 },
  { key: 'window', name: 'Window', kind: 'window', width: 1.2, height: 1.2, sill: 0.9 },
  { key: 'wide-window', name: 'Wide window', kind: 'window', width: 2, height: 1.2, sill: 0.9 },
]
