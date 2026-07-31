import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TokenLength from './TokenLength.vue'

describe('TokenLength', () => {
  it('exposes an accessible radio group and emits keyboard selection', async () => {
    const wrapper = mount(TokenLength, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    const group = wrapper.get('[role="radiogroup"]')
    const options = group.findAll('[role="radio"]')

    expect(wrapper.get('.sr-only').text()).toBe('Token Length')
    expect(options).toHaveLength(3)
    expect(options.map((option) => option.text())).toEqual(['6-digit', '7-digit', '8-digit'])
    expect(options[0]?.attributes('aria-checked')).toBe('true')

    ;(options[0]?.element as HTMLElement | undefined)?.focus()
    await options[0]?.trigger('keydown', { key: 'ArrowRight', code: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([7])
    await wrapper.setProps({ modelValue: 7 })
    expect(options[1]?.attributes('aria-checked')).toBe('true')

    await wrapper.setProps({ modelValue: 8 })
    expect(options[2]?.attributes('aria-checked')).toBe('true')

    wrapper.unmount()
  })
})
