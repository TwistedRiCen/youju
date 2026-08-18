<script setup lang="ts">
import { computed, ref } from 'vue'
import { getAppPreferencesRepository } from '../browser/storage-persistence.js'
import { getCaseRepository } from '../services/case-service.js'
import { deleteAllLocalData } from '../services/delete-case-service.js'

const confirmation = ref('')
const clearing = ref(false)
const clearError = ref('')
const canClear = computed(() => confirmation.value === '删除全部本地数据')

async function clearAllLocalData(): Promise<void> {
  if (!canClear.value || clearing.value) return
  clearing.value = true
  clearError.value = ''
  try {
    const { getEvidenceBlobStore } = await import('../services/evidence-service.js')
    const result = await deleteAllLocalData({
      repository: await getCaseRepository(),
      blobStore: getEvidenceBlobStore(),
      preferences: await getAppPreferencesRepository(),
    })
    if (result.status !== 'deleted') {
      clearError.value = `删除核验未通过，仍可能残留：${result.remaining.join('、')}`
      return
    }
    window.location.assign('/')
  } catch {
    clearError.value = '删除或核验未完成，请不要假定数据已经清除。'
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <main class="info-shell">
    <a href="/">返回首页</a>
    <h1>隐私与数据边界</h1>
    <p class="summary">有据采用本地优先设计，不要求注册，也不默认上传事件和原始材料。</p>

    <section data-privacy-topic>
      <h2>本地保存位置</h2>
      <p>IndexedDB 保存结构化事件、事实、时间线、操作记录和低敏应用偏好；OPFS 保存原始材料。API Key 只在当前页面会话内存中，不写入这些存储。</p>
    </section>
    <section data-privacy-topic>
      <h2>浏览器可能清理数据</h2>
      <p>浏览器清理、卸载应用、私密模式结束、存储压力导致的逐出以及更换设备，都可能让本地数据丢失。持久化许可也不能阻止你主动清理浏览器数据。</p>
    </section>
    <section data-privacy-topic>
      <h2>没有服务端业务副本</h2>
      <p>有据服务端不保存你的事件、事实、时间线或原始材料，也无法替你恢复这些数据。请主动导出备份。</p>
    </section>
    <section data-privacy-topic>
      <h2>导出包可能敏感</h2>
      <p>PDF、CSV、HTML 和 ZIP 导出包未加密，可能包含订单、聊天、图片等敏感信息，请在提交前自行核对并妥善保管。</p>
    </section>
    <section data-privacy-topic>
      <h2>AI 默认关闭</h2>
      <p>无 AI 也能完成核心流程。启用 AI 时需自带 API Key，Key 只在页面会话内存；每次发送前应预览范围。</p>
    </section>
    <section data-privacy-topic>
      <h2>AI 临时转发</h2>
      <p>经你确认的 AI 内容会通过同源 Fastify 临时转发到你选择的 Provider；有据不为公开演示提供共享 Key。</p>
    </section>
    <section data-privacy-topic>
      <h2>第三方 Provider 边界</h2>
      <p>Provider 对内容的保留、训练、服务改进、跨境处理和适用条款由 Provider 决定，请在启用前自行核对。</p>
    </section>
    <section data-privacy-topic>
      <h2>AI 仅产生候选</h2>
      <p>AI 候选必须有来源并由你确认；未经确认、已拒绝、冲突或无来源内容不得进入正式输出。</p>
    </section>
    <section data-privacy-topic>
      <h2>本地删除的范围</h2>
      <p>删除本地数据可清除当前浏览器中的事件、材料、操作记录和应用偏好，但不影响 Provider 已经收到的数据，也不清除你另行保存的导出文件。</p>
    </section>
    <section data-privacy-topic>
      <h2>产品边界</h2>
      <p>有据只帮助整理事实与材料，不提供法律咨询、责任结论、赔偿计算、结果预测或自动投诉。</p>
    </section>

    <section class="danger-zone" aria-labelledby="clear-all-title">
      <h2 id="clear-all-title">删除全部本地数据</h2>
      <p>此操作会删除当前浏览器中的所有真实事件、演示案例、原始材料、操作记录和应用偏好，且不可撤销。建议先导出备份。</p>
      <label for="clear-all-confirm">输入“删除全部本地数据”以确认</label>
      <input id="clear-all-confirm" v-model="confirmation" type="text" autocomplete="off" />
      <p v-if="clearError" role="alert">{{ clearError }}</p>
      <button type="button" :disabled="!canClear || clearing" @click="clearAllLocalData">
        {{ clearing ? '正在删除并核验…' : '删除并核验全部本地数据' }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.info-shell { width: min(100%, 48rem); margin: 0 auto; padding: 2rem 1.25rem 5rem; color: #18332c; }
a { color: #31564c; }
h1, h2 { color: #173f35; }
.summary, section { line-height: 1.7; }
section { margin-top: 1rem; padding: 1rem 1.2rem; border: 1px solid #d3d7ce; border-radius: 0.75rem; background: #fffdf8; }
section h2 { margin-top: 0; font-size: 1.05rem; }
section p { margin-bottom: 0; }
.danger-zone { border-color: #e0b3a4; background: #fdf0ea; }
.danger-zone label { display: block; margin: 1rem 0 0.35rem; font-weight: 700; }
.danger-zone input { width: 100%; padding: 0.65rem; border: 1px solid #c98e7b; border-radius: 0.45rem; }
.danger-zone button { margin-top: 0.75rem; padding: 0.7rem 1rem; border: 0; border-radius: 0.5rem; background: #a03b1e; color: #fff; font-weight: 700; }
.danger-zone button:disabled { opacity: 0.55; }
</style>
