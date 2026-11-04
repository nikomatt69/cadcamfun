import { expect, test } from 'bun:test'
import domino from '@mixmark-io/domino'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { StillContext, useReducedMotion } from '../src/stageshow/kit/reduced-motion'

test('reduced motion is read on first client render, follows changes, and unsubscribes', async () => {
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  const window = domino.createWindow('<html><body><div id="root"></div></body></html>')
  let reduced = true
  const listeners = new Set<() => void>()
  const media = {
    get matches() { return reduced },
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener) },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener) },
  }
  Object.defineProperty(window, 'matchMedia', { value: () => media, configurable: true })
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const Probe = () => React.createElement('span', null, useReducedMotion() ? 'still' : 'motion')
  const node = window.document.getElementById('root')!
  const root = createRoot(node)
  try {
    // The server snapshot is independent of browser-only preferences.
    expect(renderToString(React.createElement(Probe))).toContain('motion')
    await act(() => root.render(React.createElement(Probe)))
    expect(node.textContent).toBe('still')
    reduced = false
    await act(() => { for (const listener of listeners) listener() })
    expect(node.textContent).toBe('motion')
    await act(() => root.render(React.createElement(StillContext.Provider, { value: true }, React.createElement(Probe))))
    expect(node.textContent).toBe('still')
  } finally {
    await act(() => root.unmount())
    for (const name of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const) {
      const descriptor = previous[name]
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
  expect(listeners.size).toBe(0)
})
