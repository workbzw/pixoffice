import type { Template, World } from '../model.ts'
import type { NavigationAdapter } from '../navigationAdapter.ts'
import type { MapDocument } from './schema.ts'
import { materializeMap } from './MapDraft.ts'
import { sceneError } from '../protocol.ts'
import { validateFurnitureFootprints } from './furnitureGrid.ts'
export { furnitureCells, snapFurniture } from './furnitureGrid.ts'

export function checkFurniturePlacement(document: MapDocument, prop: MapDocument['props'][number], current: World, template: (id: string) => Template, navigation: NavigationAdapter) {
  const next = { ...document, props: [...document.props.filter(p => p.id !== prop.id), prop] }
  try {
    // Pointer previews only check geometry; atomic drops run full reachability validation.
    const world = materializeMap(next, current, template)
    validateFurnitureFootprints(world, template)
    navigation.validate(world, { connectivity: false })
    return { valid: true as const }
  } catch (error) { return { valid: false as const, error: sceneError(error) } }
}
