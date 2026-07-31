import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import CaseWorkspaceView from './views/CaseWorkspaceView.vue'
import CreateCaseView from './views/CreateCaseView.vue'
import HomeView from './views/HomeView.vue'
import MaterialsView from './views/MaterialsView.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: '/cases/new',
    name: 'create-case',
    component: CreateCaseView,
  },
  {
    path: '/cases/:caseId',
    name: 'case-workspace',
    component: CaseWorkspaceView,
  },
  {
    path: '/cases/:caseId/materials',
    name: 'case-materials',
    component: MaterialsView,
  },
]

if (import.meta.env.DEV) {
  routes.push({
    path: '/dev/diagnostics',
    name: 'diagnostics',
    component: () => import('./views/DiagnosticsView.vue'),
  })
}

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
