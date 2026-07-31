import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import CaseWorkspaceView from './views/CaseWorkspaceView.vue'
import CreateCaseView from './views/CreateCaseView.vue'
import ExportView from './views/ExportView.vue'
import FactsView from './views/FactsView.vue'
import FindingsView from './views/FindingsView.vue'
import HomeView from './views/HomeView.vue'
import MaterialsView from './views/MaterialsView.vue'
import StatementView from './views/StatementView.vue'
import TimelineView from './views/TimelineView.vue'

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
  {
    path: '/cases/:caseId/facts',
    name: 'case-facts',
    component: FactsView,
  },
  {
    path: '/cases/:caseId/timeline',
    name: 'case-timeline',
    component: TimelineView,
  },
  {
    path: '/cases/:caseId/findings',
    name: 'case-findings',
    component: FindingsView,
  },
  {
    path: '/cases/:caseId/statement',
    name: 'case-statement',
    component: StatementView,
  },
  {
    path: '/cases/:caseId/export',
    name: 'case-export',
    component: ExportView,
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
