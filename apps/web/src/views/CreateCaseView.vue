<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createLocalCase, getCaseRepository } from '../services/case-service.js'
import { requestStoragePersistenceAfterUserAction } from '../browser/storage-persistence.js'

const router = useRouter()
const title = ref('')
const purchaseTime = ref('')
const merchantName = ref('')
const productName = ref('')
const paidAmountYuan = ref('')
const requestedResolution = ref('')
const saving = ref(false)
const errorMessage = ref('')

async function submit(): Promise<void> {
  if (saving.value) {
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const repository = await getCaseRepository()
    const stored = await createLocalCase(repository, {
      title: title.value,
      purchaseTime: purchaseTime.value,
      merchantName: merchantName.value,
      productName: productName.value,
      paidAmountYuan: paidAmountYuan.value,
      requestedResolution: requestedResolution.value,
    })
    await requestStoragePersistenceAfterUserAction().catch(() => undefined)
    await router.push({ name: 'case-workspace', params: { caseId: stored.caseEvent.id } })
  } catch {
    errorMessage.value = '创建失败，请重试。已填写内容仍保留在此页面。'
    saving.value = false
  }
}
</script>

<template>
  <main class="create-shell">
    <a class="back" href="/">返回首页</a>
    <h1>创建本地事件</h1>
    <p class="risk">
      事件数据只保存在当前浏览器设备中；清理浏览器数据或更换设备可能导致数据丢失，建议完成后及时导出备份。
    </p>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="case-title">事件标题</label>
        <input id="case-title" v-model="title" type="text" required />
      </div>
      <div class="field">
        <label for="purchase-time">购买时间</label>
        <input id="purchase-time" v-model="purchaseTime" type="datetime-local" required />
      </div>
      <div class="field">
        <label for="merchant-name">商家名称</label>
        <input id="merchant-name" v-model="merchantName" type="text" required />
      </div>
      <div class="field">
        <label for="product-name">商品名称</label>
        <input id="product-name" v-model="productName" type="text" required />
      </div>
      <div class="field">
        <label for="paid-amount">实付金额（元）</label>
        <input id="paid-amount" v-model="paidAmountYuan" type="text" inputmode="decimal" required />
      </div>
      <div class="field">
        <label for="requested-resolution">期望处理结果</label>
        <input id="requested-resolution" v-model="requestedResolution" type="text" required />
      </div>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="saving">创建事件</button>
    </form>
  </main>
</template>

<style scoped>
.create-shell {
  width: min(100%, 36rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.back {
  color: #527067;
}

h1 {
  margin: 1rem 0 0.5rem;
  color: #173f35;
}

.risk {
  color: #7a5a32;
  line-height: 1.6;
}

.field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

label {
  color: #31564c;
  font-weight: 700;
}

input {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid #c8cdc5;
  border-radius: 0.5rem;
  background: #fff;
}

button {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 0;
  border-radius: 0.6rem;
  background: #173f35;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.error {
  color: #a03b1e;
  font-weight: 700;
}
</style>
