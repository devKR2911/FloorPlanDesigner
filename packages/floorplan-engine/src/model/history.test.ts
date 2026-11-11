import { beforeEach, describe, expect, it } from 'vitest'
import { Floorplan } from './floorplan.js'
import { History } from './history.js'

let fp: Floorplan
let history: History
let time: number
let events: number

beforeEach(() => {
  fp = new Floorplan({ wallThickness: 0.2 })
  time = 0
  history = new History(fp, { now: () => time })
  events = 0
  history.on('change', () => events++)
})

/** A wall from the origin, as three changes: two corners and the wall. */
function addWall(length = 4): string {
  return fp.addWall(fp.addCorner(0, 0), fp.addCorner(length, 0))
}

describe('History', () => {
  it('starts with nothing to undo or redo', () => {
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
    expect(history.undo()).toBe(false)
    expect(history.redo()).toBe(false)
  })

  it('undoes and redoes a change exactly', () => {
    const before = fp.export()
    fp.addCorner(1, 2)
    const after = fp.export()

    expect(history.undo()).toBe(true)
    expect(fp.export()).toEqual(before)
    expect(history.canRedo).toBe(true)
    expect(history.redo()).toBe(true)
    expect(fp.export()).toEqual(after)
    expect(history.canRedo).toBe(false)
  })

  it('makes each change outside a gesture its own step', () => {
    addWall()
    expect(fp.walls).toHaveLength(1)
    history.undo()
    expect(fp.walls).toHaveLength(0)
    expect(fp.corners).toHaveLength(2)
    history.undo()
    history.undo()
    expect(fp.corners).toHaveLength(0)
    expect(history.canUndo).toBe(false)
  })

  it('makes everything between begin and end one step', () => {
    history.begin()
    const wall = addWall()
    fp.addOpening({ wallId: wall, kind: 'door', offset: 2 })
    history.end()

    expect(history.undo()).toBe(true)
    expect(fp.export()).toMatchObject({ corners: [], walls: [], openings: [] })
    expect(history.canUndo).toBe(false)
    history.redo()
    expect(fp.walls).toHaveLength(1)
    expect(fp.openings).toHaveLength(1)
  })

  it('undoes a drag to where it started, however many moves it took', () => {
    addWall()
    const corner = fp.corners[1]!.id
    history.begin()
    for (let x = 4; x <= 6; x += 0.25) fp.moveCorner(corner, x, 0, { resolve: false })
    history.end()
    expect(fp.getCorner(corner)!.x).toBe(6)

    history.undo()
    expect(fp.getCorner(corner)!.x).toBe(4)
    history.redo()
    expect(fp.getCorner(corner)!.x).toBe(6)
  })

  it('records nothing for a gesture that changes nothing', () => {
    history.begin()
    history.end()
    expect(history.canUndo).toBe(false)
    expect(events).toBe(0)
  })

  it('tolerates an end without a begin, and nested gestures', () => {
    history.end()
    history.begin()
    history.begin()
    fp.addCorner(0, 0)
    history.end()
    fp.addCorner(3, 0)
    history.end()
    history.undo()
    expect(fp.corners).toHaveLength(0)
  })

  it('does not undo in the middle of a gesture', () => {
    fp.addCorner(0, 0)
    history.begin()
    fp.addCorner(3, 0)
    expect(history.undo()).toBe(false)
    history.end()
    expect(fp.corners).toHaveLength(2)
  })

  it('joins edits to the same wall made close together', () => {
    const wall = addWall()
    for (const thickness of [0.3, 0.35, 0.4]) {
      time += 300
      fp.updateWall(wall, { thickness })
    }
    history.undo()
    expect(fp.getWall(wall)!.thickness).toBe(0.2)
    history.redo()
    expect(fp.getWall(wall)!.thickness).toBe(0.4)
  })

  it('does not join edits that are far apart in time, or to different things', () => {
    const wall = addWall()
    fp.updateWall(wall, { thickness: 0.3 })
    time += 5000
    fp.updateWall(wall, { thickness: 0.4 })
    history.undo()
    expect(fp.getWall(wall)!.thickness).toBe(0.3)

    const a = fp.addItem({ catalogKey: 'chair', position: { x: 1, y: 1 } })
    const b = fp.addItem({ catalogKey: 'chair', position: { x: 2, y: 2 } })
    fp.updateItem(a, { rotation: 1 })
    fp.updateItem(b, { rotation: 1 })
    history.undo()
    expect(fp.getItem(b)!.rotation).toBe(0)
    expect(fp.getItem(a)!.rotation).toBe(1)
  })

  it('does not join an edit across an undo', () => {
    const wall = addWall()
    fp.updateWall(wall, { thickness: 0.3 })
    fp.updateWall(wall, { thickness: 0.4 })
    history.undo()
    expect(fp.getWall(wall)!.thickness).toBe(0.2)
    fp.updateWall(wall, { thickness: 0.5 })
    history.undo()
    expect(fp.getWall(wall)!.thickness).toBe(0.2)
  })

  it('drops the steps to redo when a new change is made', () => {
    fp.addCorner(0, 0)
    fp.addCorner(3, 0)
    history.undo()
    fp.addCorner(0, 5)
    expect(history.canRedo).toBe(false)
    expect(fp.corners.map((corner) => corner.y)).toEqual([0, 5])
  })

  it('undoes every kind of change', () => {
    const wall = addWall()
    const empty = fp.export()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 2 })
    const chair = fp.addItem({ catalogKey: 'chair', position: { x: 1, y: 1 } })
    fp.updateOpening(door, { offset: 1 })
    time += 5000
    fp.updateItem(chair, { position: { x: 3, y: 3 } })
    time += 5000
    fp.removeItem(chair)
    fp.removeWall(wall)
    expect(fp.walls).toHaveLength(0)

    const states = [fp.export()]
    while (history.undo()) states.push(fp.export())
    // Six changes after the wall, and the three that made the wall.
    expect(states).toHaveLength(10)
    expect(states[6]).toEqual(empty)
    expect(states[5]!.openings[0]).toMatchObject({ id: door, offset: 2 })
    expect(states[1]!.walls).toHaveLength(1)
    while (history.redo());
    expect(fp.export()).toEqual(states[0])
  })

  it('keeps ids, so what was selected can stay selected', () => {
    const wall = addWall()
    fp.removeWall(wall)
    history.undo()
    expect(fp.getWall(wall)).toBeDefined()
  })

  it('keeps only as many steps as its limit', () => {
    const short = new History(fp, { limit: 3 })
    for (let i = 0; i < 5; i++) fp.addCorner(i * 2, 0)
    let undone = 0
    while (short.undo()) undone++
    expect(undone).toBe(3)
    expect(fp.corners).toHaveLength(2)
  })

  it('is cleared by loading a plan, but not by restoring one', () => {
    fp.addCorner(0, 0)
    fp.load(fp.export())
    expect(history.canUndo).toBe(false)

    fp.addCorner(3, 0)
    fp.restore(fp.export())
    expect(history.canUndo).toBe(true)
  })

  it('gives each state its own position, and returns to it on undo and redo', () => {
    const start = history.position
    fp.addCorner(0, 0)
    const one = history.position
    fp.addCorner(3, 0)
    const two = history.position
    expect(new Set([start, one, two]).size).toBe(3)

    history.undo()
    expect(history.position).toBe(one)
    history.undo()
    expect(history.position).toBe(start)
    history.redo()
    expect(history.position).toBe(one)
  })

  it('changes position on every change, also within a gesture and a joined edit', () => {
    const wall = addWall()
    const seen = new Set([history.position])
    history.begin()
    fp.moveCorner(fp.corners[1]!.id, 5, 0, { resolve: false })
    seen.add(history.position)
    fp.moveCorner(fp.corners[1]!.id, 6, 0, { resolve: false })
    seen.add(history.position)
    history.end()
    fp.updateWall(wall, { thickness: 0.3 })
    seen.add(history.position)
    fp.updateWall(wall, { thickness: 0.4 })
    seen.add(history.position)
    expect(seen.size).toBe(5)
  })

  it('reports a change once per step, undo and redo', () => {
    fp.addCorner(0, 0)
    expect(events).toBe(1)
    history.begin()
    fp.addCorner(3, 0)
    fp.addCorner(6, 0)
    expect(events).toBe(1)
    history.end()
    expect(events).toBe(2)
    history.undo()
    history.redo()
    expect(events).toBe(4)
  })

  it('stops following the plan after dispose', () => {
    history.dispose()
    fp.addCorner(0, 0)
    expect(history.canUndo).toBe(false)
  })
})
