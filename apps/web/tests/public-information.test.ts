import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FeedbackTemplate from '../src/components/FeedbackTemplate.vue'
import AboutView from '../src/views/AboutView.vue'
import PrivacyView from '../src/views/PrivacyView.vue'

describe('public information', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('explains every local, AI, Provider, deletion, export and product boundary', () => {
    const wrapper = mount(PrivacyView)
    const text = wrapper.text()

    for (const expected of [
      'IndexedDB',
      'OPFS',
      '当前页面会话内存',
      '浏览器清理',
      '存储压力',
      '服务端不保存',
      '导出包',
      '同源 Fastify',
      'Provider',
      '保留',
      '训练',
      '跨境',
      '未经确认',
      '本地删除',
      '不提供法律',
    ]) {
      expect(text).toContain(expected)
    }
  })

  it('shows honest release, browser and Provider verification status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('missing release')))
    const wrapper = mount(AboutView)
    await flushPromises()

    expect(wrapper.text()).toContain('发布编号尚未生成')
    expect(wrapper.text()).toContain('浏览器能力检测')
    expect(wrapper.text()).toContain('真实设备矩阵尚未验证')
    expect(wrapper.text()).toContain('真实 Provider 尚未验证')
    expect(wrapper.text()).toContain('不提供法律咨询')
  })

  it('copies only the release ID and sanitized user-entered feedback without an external link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(FeedbackTemplate, { props: { releaseId: '2026.08.0' } })
    await wrapper.get('textarea').setValue('页面\u0000提示不清楚\r\n请改进')
    await wrapper.get('button[data-action="copy-feedback"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith(
      '有据反馈\n发布编号：2026.08.0\n问题描述：\n页面提示不清楚\n请改进',
    )
    expect(wrapper.find('a[target="_blank"]').exists()).toBe(false)
  })
})
