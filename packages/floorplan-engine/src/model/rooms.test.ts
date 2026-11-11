import { describe, expect, it } from 'vitest'
import type { Corner } from '../schema/plan.js'
import { findRooms } from './rooms.js'

/** Builds corners from `id: [x, y]` and walls from `[start, end]` pairs, named `start-end`. */
function graph(points: Record<string, readonly [number, number]>, pairs: [string, string][]) {
  const corners: Corner[] = Object.entries(points).map(([id, [x, y]]) => ({ id, x, y }))
  const walls = pairs.map(([start, end]) => ({ id: `${start}-${end}`, start, end }))
  return findRooms(corners, walls)
}

/** The corner ids of a room, rotated so the smallest id comes first. Orientation is preserved. */
function cycle(ids: string[]): string[] {
  const first = ids.indexOf([...ids].sort()[0]!)
  return [...ids.slice(first), ...ids.slice(0, first)]
}

const squarePoints = { a: [0, 0], b: [4, 0], c: [4, 4], d: [0, 4] } as const

describe('findRooms', () => {
  it('finds one square room', () => {
    const { rooms, wallSides } = graph(squarePoints, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
    ])
    expect(rooms).toHaveLength(1)
    expect(rooms[0]!.id).toBe('a-b-c-d')
    expect(cycle(rooms[0]!.cornerIds)).toEqual(['a', 'b', 'c', 'd'])
    expect(rooms[0]!.wallIds).toHaveLength(4)
    // Walls drawn counter-clockwise have the room on their front.
    expect(wallSides.get('a-b')).toEqual({ front: 'a-b-c-d' })
    expect(wallSides.get('d-a')).toEqual({ front: 'a-b-c-d' })
  })

  it('reports a room drawn clockwise as counter-clockwise', () => {
    const { rooms, wallSides } = graph(squarePoints, [
      ['a', 'd'],
      ['d', 'c'],
      ['c', 'b'],
      ['b', 'a'],
    ])
    expect(rooms).toHaveLength(1)
    expect(cycle(rooms[0]!.cornerIds)).toEqual(['a', 'b', 'c', 'd'])
    expect(wallSides.get('a-d')).toEqual({ back: 'a-b-c-d' })
  })

  it('finds two rooms that share a wall, one on each side of it', () => {
    const { rooms, wallSides } = graph(
      { a: [0, 0], b: [4, 0], c: [8, 0], d: [8, 4], e: [4, 4], f: [0, 4] },
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'e'],
        ['e', 'f'],
        ['f', 'a'],
        ['b', 'e'],
      ],
    )
    expect(rooms.map((room) => room.id)).toEqual(['a-b-e-f', 'b-c-d-e'])
    expect(cycle(rooms[0]!.cornerIds)).toEqual(['a', 'b', 'e', 'f'])
    expect(cycle(rooms[1]!.cornerIds)).toEqual(['b', 'c', 'd', 'e'])
    // Walking b→e goes up the page, so the left room is on the front.
    expect(wallSides.get('b-e')).toEqual({ front: 'a-b-e-f', back: 'b-c-d-e' })
    expect(wallSides.get('a-b')).toEqual({ front: 'a-b-e-f' })
  })

  it('finds an L-shaped room and keeps a collinear corner', () => {
    const { rooms } = graph(
      { a: [0, 0], m: [2, 0], b: [4, 0], c: [4, 2], d: [2, 2], e: [2, 4], f: [0, 4] },
      [
        ['a', 'm'],
        ['m', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'e'],
        ['e', 'f'],
        ['f', 'a'],
      ],
    )
    expect(rooms).toHaveLength(1)
    expect(cycle(rooms[0]!.cornerIds)).toEqual(['a', 'm', 'b', 'c', 'd', 'e', 'f'])
  })

  it('ignores a wall that dangles into a room', () => {
    const { rooms, wallSides } = graph({ ...squarePoints, x: [2, 2] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['b', 'x'],
    ])
    expect(rooms).toHaveLength(1)
    expect(cycle(rooms[0]!.cornerIds)).toEqual(['a', 'b', 'c', 'd'])
    expect(rooms[0]!.wallIds).not.toContain('b-x')
    expect(wallSides.has('b-x')).toBe(false)
  })

  it('ignores a wall that dangles outside', () => {
    const { rooms } = graph({ ...squarePoints, x: [6, 0], y: [8, 0] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['b', 'x'],
      ['x', 'y'],
    ])
    expect(rooms).toHaveLength(1)
    expect(cycle(rooms[0]!.cornerIds)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('finds no rooms when the walls do not close', () => {
    const { rooms, wallSides } = graph(squarePoints, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ])
    expect(rooms).toEqual([])
    expect(wallSides.size).toBe(0)
  })

  it('finds a room in each separate group of walls', () => {
    const { rooms } = graph({ ...squarePoints, p: [10, 0], q: [14, 0], r: [14, 4], s: [10, 4] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['p', 'q'],
      ['q', 'r'],
      ['r', 's'],
      ['s', 'p'],
    ])
    expect(rooms.map((room) => room.id)).toEqual(['a-b-c-d', 'p-q-r-s'])
  })

  it('reports a room inside a room as two rooms', () => {
    const { rooms } = graph({ ...squarePoints, p: [1, 1], q: [2, 1], r: [2, 2], s: [1, 2] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
      ['p', 'q'],
      ['q', 'r'],
      ['r', 's'],
      ['s', 'p'],
    ])
    expect(rooms.map((room) => room.id)).toEqual(['a-b-c-d', 'p-q-r-s'])
    // The outer room's outline ignores the hole in this phase.
    expect(rooms[0]!.cornerIds).toHaveLength(4)
  })

  it('finds three rooms around a shared corner', () => {
    // A 2x2 block missing its bottom-right room.
    const { rooms } = graph(
      {
        a: [0, 0],
        b: [2, 0],
        c: [0, 2],
        d: [2, 2],
        e: [4, 2],
        f: [0, 4],
        g: [2, 4],
        h: [4, 4],
      },
      [
        ['a', 'b'],
        ['b', 'd'],
        ['d', 'c'],
        ['c', 'a'],
        ['d', 'e'],
        ['e', 'h'],
        ['h', 'g'],
        ['g', 'd'],
        ['c', 'f'],
        ['f', 'g'],
      ],
    )
    expect(rooms.map((room) => room.id)).toEqual(['a-b-c-d', 'c-d-f-g', 'd-e-g-h'])
  })

  it('returns the same ids whatever the input order', () => {
    const forward = graph(squarePoints, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
    ])
    const shuffled = graph({ d: [0, 4], b: [4, 0], a: [0, 0], c: [4, 4] }, [
      ['c', 'd'],
      ['a', 'b'],
      ['d', 'a'],
      ['b', 'c'],
    ])
    expect(shuffled.rooms.map((room) => room.id)).toEqual(forward.rooms.map((room) => room.id))
  })
})
