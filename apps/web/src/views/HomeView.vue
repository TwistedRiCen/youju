<template>
  <main class="home-shell">
    <header class="hero">
      <p class="eyebrow">本地优先 · 网购退款纠纷材料整理</p>
      <h1>有据</h1>
      <p class="lead">整理事实与材料，不替你作法律判断</p>
    </header>

    <section class="principles" aria-labelledby="principles-title">
      <h2 id="principles-title">先把材料理清楚</h2>
      <p class="no-account">无需注册；不使用AI也能完成核心流程</p>
      <ul>
        <li>原始材料默认保存在你的设备中</li>
        <li>AI只生成候选内容，必须经过你的确认</li>
        <li>不提供法律结论、赔偿计算或结果预测</li>
      </ul>
    </section>

    <section class="milestone" aria-labelledby="milestone-title">
      <h2 id="milestone-title">当前版本</h2>
      <p>M1正在建立可验证的产品基础；事件创建与材料导入将在M2开放。</p>
    </section>
  </main>
</template>

<style scoped>
.home-shell {
  width: min(100%, 46rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}

.hero {
  padding: 1.5rem 0 2rem;
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: #527067;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.75rem;
  color: #173f35;
  font-size: clamp(3rem, 18vw, 5.5rem);
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.lead {
  max-width: 18em;
  margin-bottom: 0;
  color: #31564c;
  font-size: clamp(1.25rem, 5.5vw, 1.75rem);
  line-height: 1.45;
}

.principles,
.milestone {
  border: 1px solid #d3d7ce;
  border-radius: 1rem;
  background: #fffdf8;
  box-shadow: 0 1rem 2.5rem rgb(23 63 53 / 8%);
}

.principles {
  padding: 1.5rem;
}

.principles h2,
.milestone h2 {
  color: #173f35;
  font-size: 1.1rem;
}

.no-account {
  color: #9b491e;
  font-weight: 700;
}

ul {
  display: grid;
  gap: 0.75rem;
  margin: 1.25rem 0 0;
  padding-left: 1.25rem;
  line-height: 1.6;
}

.milestone {
  margin-top: 1rem;
  padding: 1.25rem 1.5rem;
}

.milestone p {
  margin-bottom: 0;
  color: #527067;
  line-height: 1.6;
}

@media (min-width: 40rem) {
  .home-shell {
    padding: 4rem 2rem;
  }

  .hero {
    padding-bottom: 3rem;
  }
}
</style>
