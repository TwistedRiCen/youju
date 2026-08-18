<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { StoredCase } from '../storage/index.js'
import {
  PUBLIC_DEMO_FIXTURE_ID,
  findDemoCase,
  loadDemoCase,
  resetDemoCase,
} from '../demo/index.js'

const router = useRouter()
const existingDemo = shallowRef<StoredCase | null>(null)
const checking = ref(true)
const busy = ref(false)
const message = ref('')

onMounted(async () => {
  try {
    existingDemo.value = await findDemoCase(PUBLIC_DEMO_FIXTURE_ID)
  } catch {
    message.value = '暂时无法检查本地演示状态；你仍可创建自己的事件。'
  } finally {
    checking.value = false
  }
})

async function loadDemo(): Promise<void> {
  if (busy.value) return
  busy.value = true
  message.value = '正在校验并加载完全虚构演示…'
  try {
    const result = await loadDemoCase(PUBLIC_DEMO_FIXTURE_ID)
    await router.push({ name: 'case-workspace', params: { caseId: result.caseId } })
  } catch {
    message.value = '演示加载未完成，未报告虚假成功。请检查浏览器存储空间后重试。'
  } finally {
    busy.value = false
  }
}

async function openDemo(): Promise<void> {
  if (existingDemo.value === null) return
  await router.push({
    name: 'case-workspace',
    params: { caseId: existingDemo.value.caseEvent.id },
  })
}

async function resetDemo(): Promise<void> {
  if (busy.value || existingDemo.value === null) return
  if (!window.confirm('重置将删除并重新创建这一个演示案例，不会修改你自己创建的事件。继续吗？')) return
  busy.value = true
  message.value = '正在核验删除并重置演示…'
  try {
    const result = await resetDemoCase(PUBLIC_DEMO_FIXTURE_ID)
    await router.push({ name: 'case-workspace', params: { caseId: result.caseId } })
  } catch {
    message.value = '演示重置未完成；你的真实事件未被修改。请重试。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="home-shell">
    <header class="hero">
      <p class="eyebrow">本地优先 · 网购退款纠纷材料整理</p>
      <h1>有据</h1>
      <p class="lead">整理事实与材料，不替你作法律判断</p>
    </header>

    <section class="principles" aria-labelledby="principles-title">
      <h2 id="principles-title">先把材料理清楚</h2>
      <p class="no-account">无需注册；无需 AI 也能完成核心流程</p>
      <ul>
        <li>保存原始材料，整理并确认事实</li>
        <li>建立时间线，检查材料缺口</li>
        <li>确认事实陈述，导出可核验材料包</li>
        <li>原始材料默认只保存在当前浏览器设备</li>
        <li>AI 仅生成候选内容，必须经过你的确认</li>
        <li>不提供法律结论、赔偿计算或结果预测</li>
      </ul>
    </section>

    <section class="start" aria-labelledby="start-title">
      <h2 id="start-title">选择开始方式</h2>
      <div class="start-actions">
        <button
          v-if="!checking && existingDemo === null"
          type="button"
          class="start-action demo"
          data-action="load-demo"
          :disabled="busy"
          @click="loadDemo"
        >
          {{ busy ? '正在加载演示…' : '加载完全虚构演示' }}
        </button>
        <template v-else-if="existingDemo !== null">
          <button
            type="button"
            class="start-action demo"
            data-action="open-demo"
            :disabled="busy"
            @click="openDemo"
          >
            打开已有演示
          </button>
          <button
            type="button"
            class="reset-action"
            data-action="reset-demo"
            :disabled="busy"
            @click="resetDemo"
          >
            {{ busy ? '正在重置…' : '重置演示案例' }}
          </button>
        </template>
        <RouterLink
          class="start-action user"
          data-action="create-case"
          aria-label="创建本地事件"
          :to="{ name: 'create-case' }"
        >
          创建我的事件
        </RouterLink>
      </div>
      <p class="demo-note">演示中的商家、商品、金额、沟通和材料均为完全虚构内容。</p>
      <p v-if="message" class="status" role="status">{{ message }}</p>
    </section>

    <nav class="public-links" aria-label="公开信息">
      <RouterLink to="/privacy">隐私与数据边界</RouterLink>
      <RouterLink to="/about">关于、版本与反馈</RouterLink>
    </nav>
  </main>
</template>

<style scoped>
.home-shell { width: min(100%, 48rem); min-height: 100vh; margin: 0 auto; padding: 2rem 1.25rem 5rem; }
.hero { padding: 1.5rem 0 2rem; }
.eyebrow { margin: 0 0 0.75rem; color: #527067; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 0.75rem; color: #173f35; font-size: clamp(3rem, 18vw, 5.5rem); line-height: 0.95; letter-spacing: -0.06em; }
.lead { max-width: 18em; margin-bottom: 0; color: #31564c; font-size: clamp(1.25rem, 5.5vw, 1.75rem); line-height: 1.45; }
.principles { padding: 1.5rem; border: 1px solid #d3d7ce; border-radius: 1rem; background: #fffdf8; box-shadow: 0 1rem 2.5rem rgb(23 63 53 / 8%); }
.principles h2, .start h2 { color: #173f35; font-size: 1.1rem; }
.no-account { color: #9b491e; font-weight: 700; }
ul { display: grid; gap: 0.65rem; margin: 1.25rem 0 0; padding-left: 1.25rem; line-height: 1.6; }
.start { margin-top: 1.5rem; }
.start-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.start-action, .reset-action { display: grid; place-items: center; min-height: 3.25rem; border-radius: 0.7rem; padding: 0.8rem 1rem; font: inherit; font-weight: 700; text-align: center; text-decoration: none; }
.start-action { border: 0; background: #173f35; color: #fff; }
.start-action.demo { background: #8f431d; }
.reset-action { border: 1px solid #8f431d; background: #fff; color: #8f431d; }
button:disabled { opacity: 0.6; }
.demo-note, .status { margin: 0.75rem 0 0; color: #6d5540; line-height: 1.6; }
.public-links { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
.public-links a { color: #31564c; font-weight: 700; }
@media (max-width: 34rem) { .start-actions { grid-template-columns: 1fr; } }
</style>
