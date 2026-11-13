import { describe, expect, it, vi } from 'vitest'
import { planSchema, type Plan } from '../schema/plan.js'
import { Floorplan, FloorplanError } from './floorplan.js'
import { History } from './history.js'

/** A 4 × 3 room on the left and a 3 × 3 room on the right, sharing the wall b–e. */
function twoRooms(): Floorplan {
  const fp = new Floorplan()
  fp.load({
    version: 1,
    corners: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 },
      { id: 'c', x: 7, y: 0 },
      { id: 'd', x: 7, y: 3 },
      { id: 'e', x: 4, y: 3 },
      { id: 'f', x: 0, y: 3 },
    ],
    walls: ['ab', 'bc', 'cd', 'de', 'ef', 'fa', 'be'].map((id) => ({
      id,
      start: id[0]!,
      end: id[1]!,
      thickness: 0.2,
      height: 2.5,
    })),
    items: [],
  })
  return fp
}

const roomAt = (fp: Floorplan, x: number, y: number) =>
  fp.rooms.find(
    (room) => Math.abs(room.centroid.x - x) < 0.5 && Math.abs(room.centroid.y - y) < 0.5,
  )!

const left = (fp: Floorplan) => roomAt(fp, 2, 1.5)
const right = (fp: Floorplan) => roomAt(fp, 5.5, 1.5)

describe('nameRoom', () => {
  it('names, renames and clears a room', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, '  Kitchen ')
    expect(left(fp).name).toBe('Kitchen')
    expect(right(fp).name).toBeUndefined()

    fp.nameRoom(left(fp).id, 'Dining room')
    expect(left(fp).name).toBe('Dining room')
    expect(fp.export().rooms).toHaveLength(1)

    fp.nameRoom(left(fp).id, '')
    expect(left(fp).name).toBeUndefined()
    expect(fp.export().rooms).toEqual([])
  })

  it('refuses an unknown room and a name that is too long', () => {
    const fp = twoRooms()
    expect(() => fp.nameRoom('nope', 'Kitchen')).toThrow(FloorplanError)
    expect(() => fp.nameRoom(left(fp).id, 'x'.repeat(61))).toThrow(FloorplanError)
  })

  it('does not emit a change for a name that did not change', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, 'Kitchen')
    const listener = vi.fn()
    fp.on('change', listener)
    fp.nameRoom(left(fp).id, 'Kitchen ')
    fp.nameRoom(right(fp).id, '')
    expect(listener).not.toHaveBeenCalled()
  })

  it('round-trips through export and load', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, 'Kitchen')
    const saved = fp.export()
    expect(planSchema.parse(saved)).toEqual(saved)

    const again = new Floorplan()
    again.load(saved)
    expect(left(again).name).toBe('Kitchen')
  })
})

describe('names surviving edits', () => {
  it('keeps the name when a corner moves', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, 'Kitchen')
    fp.moveCorner('a', -1, -1)
    expect(left(fp).name).toBe('Kitchen')
  })

  it('keeps the name when a wall of the room is split by a new corner', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, 'Kitchen')
    fp.addCorner(2, 0) // splits wall ab; the room id changes
    expect(roomAt(fp, 2, 1.5).name).toBe('Kitchen')
  })

  it('keeps the name when the whole room is dragged elsewhere', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, 'Kitchen')
    // In steps, as a drag arrives; the anchor follows the room from step to step.
    for (let step = 0; step < 20; step++) {
      fp.moveCorners(['a', 'b', 'c', 'd', 'e', 'f'], 0.5, 0)
    }
    expect(roomAt(fp, 12, 1.5).name).toBe('Kitchen')
  })

  it('shows the older name when two named rooms merge, and both when split again', () => {
    const fp = twoRooms()
    fp.nameRoom(left(fp).id, 'Kitchen')
    fp.nameRoom(right(fp).id, 'Dining room')

    fp.removeWall('be')
    expect(fp.rooms).toHaveLength(1)
    expect(fp.rooms[0]!.name).toBe('Kitchen')
    expect(fp.export().rooms).toHaveLength(2)

    fp.addWall('b', 'e')
    expect(left(fp).name).toBe('Kitchen')
    expect(right(fp).name).toBe('Dining room')
  })

  it('keeps a dormant record when the room is destroyed, and revives it', () => {
    const fp = twoRooms()
    fp.nameRoom(right(fp).id, 'Dining room')
    fp.removeCorner('c')
    expect(fp.rooms).toHaveLength(1)
    expect(fp.export().rooms).toHaveLength(1)

    // Corner d survived on wall d–e; redraw the two missing walls.
    const c = fp.addCorner(7, 0)
    fp.addWall('b', c)
    fp.addWall(c, 'd')
    expect(right(fp).name).toBe('Dining room')
  })
})

describe('undo', () => {
  it('joins a run of typing into one step and undoes it', () => {
    let time = 0
    const fp = twoRooms()
    const history = new History(fp, { now: () => time })
    const roomId = left(fp).id

    fp.nameRoom(roomId, 'K')
    time += 100
    fp.nameRoom(roomId, 'Ki')
    time += 100
    fp.nameRoom(roomId, 'Kitchen')
    expect(left(fp).name).toBe('Kitchen')

    expect(history.undo()).toBe(true)
    expect(left(fp).name).toBeUndefined()
    expect(history.canUndo).toBe(false)
    expect(history.redo()).toBe(true)
    expect(left(fp).name).toBe('Kitchen')
    history.dispose()
  })
})

describe('plans without names', () => {
  it('loads a plan saved before rooms could be named', () => {
    const fp = twoRooms()
    const saved = fp.export() as Partial<Plan>
    delete saved.rooms
    const again = new Floorplan()
    again.load(saved)
    expect(again.rooms).toHaveLength(2)
    expect(again.rooms.every((room) => room.name === undefined)).toBe(true)
  })
})
