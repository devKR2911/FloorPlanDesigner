import { describe, expect, it, vi } from 'vitest'
import { Emitter } from './events.js'

type Events = { ping: number; done: string }

describe('Emitter', () => {
  it('delivers the payload to every listener of that event only', () => {
    const emitter = new Emitter<Events>()
    const first = vi.fn()
    const second = vi.fn()
    const other = vi.fn()
    emitter.on('ping', first)
    emitter.on('ping', second)
    emitter.on('done', other)

    emitter.emit('ping', 7)

    expect(first).toHaveBeenCalledExactlyOnceWith(7)
    expect(second).toHaveBeenCalledExactlyOnceWith(7)
    expect(other).not.toHaveBeenCalled()
  })

  it('stops delivering after the returned unsubscribe function is called', () => {
    const emitter = new Emitter<Events>()
    const listener = vi.fn()
    const unsubscribe = emitter.on('ping', listener)

    unsubscribe()
    emitter.emit('ping', 1)

    expect(listener).not.toHaveBeenCalled()
  })

  it('lets a listener unsubscribe during delivery without skipping the others', () => {
    const emitter = new Emitter<Events>()
    const second = vi.fn()
    const unsubscribe = emitter.on('ping', () => unsubscribe())
    emitter.on('ping', second)

    emitter.emit('ping', 1)

    expect(second).toHaveBeenCalledOnce()
  })

  it('removes every listener on clear', () => {
    const emitter = new Emitter<Events>()
    const listener = vi.fn()
    emitter.on('done', listener)

    emitter.clear()
    emitter.emit('done', 'x')

    expect(listener).not.toHaveBeenCalled()
  })
})
