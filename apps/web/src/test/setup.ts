import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// What the simulated browser lacks and the dialogs and menus ask for. Tests that run without a
// browser, such as the catalogue's, have no `window` and skip this.
if (typeof window !== 'undefined') {
  const prototype = window.HTMLElement.prototype
  prototype.hasPointerCapture ??= () => false
  prototype.setPointerCapture ??= () => {}
  prototype.releasePointerCapture ??= () => {}
  prototype.scrollIntoView ??= () => {}
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
