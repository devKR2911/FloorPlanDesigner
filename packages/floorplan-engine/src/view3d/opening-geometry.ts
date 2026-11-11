import { BoxGeometry, Group, Mesh, type Material } from 'three'
import type { Point } from '../model/geometry.js'
import { openingCentre } from '../model/wall-openings.js'
import type { Opening } from '../schema/plan.js'
import { toScene } from './coordinates.js'

/** Thickness of the frame that lines an opening, in metres. */
export const FRAME_THICKNESS = 0.05
/** How far the frame stands out from each face of the wall, so it shows. Metres. */
const FRAME_PROUD = 0.01
const LEAF_THICKNESS = 0.04
const GLASS_THICKNESS = 0.01
const BAR_THICKNESS = 0.04
/** Doors are shown open by this much, so they can be seen and walked through. */
export const DOOR_OPEN_ANGLE = (80 * Math.PI) / 180

export interface OpeningMaterials {
  frame: Material
  leaf: Material
  glass: Material
  /** Draws nothing. Used for the shape that takes clicks across a doorway. */
  pick: Material
}

/** What each mesh of a door or window carries in `userData`. */
export interface OpeningPartData {
  part: 'frame' | 'leaf' | 'glass' | 'pick'
}

/**
 * Builds a door or window as a small group of boxes: a frame lining the hole, and a door leaf
 * or a pane of glass. The group sits at the middle of the opening, at sill height, turned so
 * that its `x` axis runs along the wall and its `-z` side is the wall's front.
 */
export function buildOpeningObject(
  opening: Readonly<Opening>,
  wall: { start: Point; end: Point; thickness: number },
  materials: OpeningMaterials,
): Group {
  const { width, height } = opening
  const group = new Group()
  group.position.set(...toScene(openingCentre(opening, wall.start, wall.end), opening.sill))
  // A wall's direction on the plan is the same turn about the scene's up axis.
  group.rotation.y = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x)

  const box = (
    part: OpeningPartData['part'],
    size: [number, number, number],
    centre: [number, number, number],
  ): Mesh => {
    const geometry = new BoxGeometry(...size)
    geometry.translate(...centre)
    const mesh = new Mesh(geometry, materials[part])
    mesh.userData = { part } satisfies OpeningPartData
    return mesh
  }

  const frame = FRAME_THICKNESS
  const depth = wall.thickness + FRAME_PROUD * 2
  const inner = width - frame * 2
  group.add(
    box('frame', [frame, height, depth], [-(width - frame) / 2, height / 2, 0]),
    box('frame', [frame, height, depth], [(width - frame) / 2, height / 2, 0]),
    box('frame', [inner, frame, depth], [0, height - frame / 2, 0]),
  )

  if (opening.kind === 'window') {
    const glassHeight = height - frame * 2
    group.add(
      box('frame', [inner, frame, depth], [0, frame / 2, 0]),
      box('frame', [BAR_THICKNESS, glassHeight, BAR_THICKNESS], [0, height / 2, 0]),
      box('glass', [inner, glassHeight, GLASS_THICKNESS], [0, height / 2, 0]),
    )
    return group
  }

  // The leaf hangs from a pivot at the hinge, on the face of the wall it opens towards.
  const leafHeight = height - frame
  const hingeSign = opening.hinge === 'start' ? 1 : -1
  const swingSign = opening.swing === 'front' ? 1 : -1
  const pivot = new Group()
  pivot.position.set(-hingeSign * (inner / 2), 0, -swingSign * (wall.thickness / 2))
  // Turning about the up axis carries +x towards -z, which is the wall's front.
  pivot.rotation.y = hingeSign * swingSign * DOOR_OPEN_ANGLE
  pivot.add(
    box('leaf', [inner, leafHeight, LEAF_THICKNESS], [(hingeSign * inner) / 2, leafHeight / 2, 0]),
  )
  group.add(pivot, box('pick', [inner, leafHeight, wall.thickness], [0, leafHeight / 2, 0]))
  return group
}
