import type { UnitSystem } from '@floorplandesigner/engine'
import { createContext, useContext } from 'react'

/**
 * The open plan's display unit, for the fields that show or take a length. The values they pass
 * on are always metres; the unit only decides how a value is shown and typed.
 */
export const UnitsContext = createContext<UnitSystem>('metric')

export function useUnits(): UnitSystem {
  return useContext(UnitsContext)
}
