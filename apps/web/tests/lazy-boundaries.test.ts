import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import { routes } from '../src/router.js'

function allRoutes(): readonly RouteRecordRaw[] {
  return routes.flatMap((route) => [route, ...(route.children ?? [])])
}

function find(path: string): RouteRecordRaw | undefined {
  return allRoutes().find((route) => route.path === path)
}

function isEager(path: string): boolean {
  const route = find(path)
  return route !== undefined && route.component !== undefined && typeof route.component !== 'function'
}

function isLazy(path: string): boolean {
  const route = find(path)
  return route !== undefined && typeof route.component === 'function'
}

describe('route-level loading boundaries', () => {
  it('keeps home, public information and the light workspace eagerly available', () => {
    for (const path of ['/', '/cases/new', '/privacy', '/about', '/cases/:caseId']) {
      expect(isEager(path), `expected ${path} to stay eager`).toBe(true)
    }
    for (const path of ['materials', 'facts', 'timeline', 'findings', 'statement', 'delete']) {
      expect(isEager(path), `expected ${path} to stay eager`).toBe(true)
    }
  })

  it('lazy-loads export and AI routes that pull in heavy libraries', () => {
    for (const path of ['export', 'ai-settings', 'ai', 'ai-review']) {
      expect(isLazy(path), `expected ${path} to be lazy-loaded`).toBe(true)
    }
  })

  it('never registers a heavy route without a component loader', () => {
    for (const route of allRoutes()) {
      expect(route.component, `route ${route.path} has no component`).toBeDefined()
    }
  })
})
