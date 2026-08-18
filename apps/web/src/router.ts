import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import type { UuidV4 } from '@youju/domain'
import CaseWorkspaceView from './views/CaseWorkspaceView.vue'
import CreateCaseView from './views/CreateCaseView.vue'
import DeleteCaseView from './views/DeleteCaseView.vue'
import FactsView from './views/FactsView.vue'
import FindingsView from './views/FindingsView.vue'
import HomeView from './views/HomeView.vue'
import MaterialsView from './views/MaterialsView.vue'
import StatementView from './views/StatementView.vue'
import TimelineView from './views/TimelineView.vue'
import PrivacyView from './views/PrivacyView.vue'
import AboutView from './views/AboutView.vue'

export const routes: RouteRecordRaw[] = [
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
    path: '/privacy',
    name: 'privacy',
    component: PrivacyView,
  },
  {
    path: '/about',
    name: 'about',
    component: AboutView,
  },
  {
    path: '/cases/:caseId',
    name: 'case-workspace',
    component: CaseWorkspaceView,
    children: [
      {
        path: 'materials',
        name: 'case-materials',
        component: MaterialsView,
      },
      {
        path: 'facts',
        name: 'case-facts',
        component: FactsView,
      },
      {
        path: 'timeline',
        name: 'case-timeline',
        component: TimelineView,
      },
      {
        path: 'findings',
        name: 'case-findings',
        component: FindingsView,
      },
      {
        path: 'statement',
        name: 'case-statement',
        component: StatementView,
      },
      {
        path: 'export',
        name: 'case-export',
        component: () => import('./views/ExportView.vue'),
      },
      {
        path: 'ai-settings',
        name: 'case-ai-settings',
        component: () => import('./views/AiSettingsView.vue'),
      },
      {
        path: 'ai',
        name: 'case-ai',
        component: () => import('./views/AiAssistantView.vue'),
        props: (route) => ({ caseId: String(route.params.caseId) as UuidV4 }),
      },
      {
        path: 'ai-review',
        name: 'case-ai-review',
        component: () => import('./views/AiReviewView.vue'),
        props: (route) => ({ caseId: String(route.params.caseId) as UuidV4 }),
      },
      {
        path: 'delete',
        name: 'case-delete',
        component: DeleteCaseView,
      },
    ],
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
