<script setup lang="ts">
import { loadGoldenCaseSummary } from '../services/load-golden-case-summary.js'

const summary = loadGoldenCaseSummary()
</script>

<template>
  <main class="diagnostics-shell">
    <header>
      <p class="eyebrow">仅限开发环境</p>
      <h1>黄金案例诊断</h1>
      <p>这里只展示完全虚构、低敏的案例标识与统计数量。</p>
    </header>

    <section aria-labelledby="summary-title">
      <h2 id="summary-title">{{ summary.title }}</h2>
      <dl>
        <div>
          <dt>案例ID：</dt>
          <dd>{{ summary.id }}</dd>
        </div>
        <div>
          <dt>材料数量：</dt>
          <dd>{{ summary.evidenceCount }}</dd>
        </div>
        <div>
          <dt>已确认事实：</dt>
          <dd>{{ summary.confirmedFactCount }}</dd>
        </div>
        <div>
          <dt>时间线条目：</dt>
          <dd>{{ summary.timelineCount }}</dd>
        </div>
        <div>
          <dt>规则校验：</dt>
          <dd>{{ summary.ruleValidation === 'passed' ? '通过' : '失败' }}</dd>
        </div>
      </dl>
    </section>
  </main>
</template>

<style scoped>
.diagnostics-shell {
  width: min(100%, 48rem);
  margin: 0 auto;
  padding: 2rem 1.25rem;
}

.eyebrow {
  color: #9b491e;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

section {
  margin-top: 2rem;
  padding: 1.5rem;
  border: 1px solid #d3d7ce;
  border-radius: 1rem;
  background: #fffdf8;
}

dl {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 0;
}

dl div {
  display: grid;
  grid-template-columns: minmax(7rem, 0.45fr) 1fr;
  gap: 0.75rem;
}

dt {
  color: #527067;
  font-weight: 700;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
