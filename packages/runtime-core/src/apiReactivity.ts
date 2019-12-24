export {
  ref,
  isRef,
  toRefs,
  reactive,
  isReactive,
  readonly,
  isReadonly,
  toRaw,
  markReadonly,
  markNonReactive,
  effect,
  // types
  ReactiveEffect,
  ReactiveEffectOptions,
  DebuggerEvent,
  OperationTypes,
  Ref,
  ComputedRef,
  UnwrapRef,
  WritableComputedOptions
} from '@vue/reactivity'

import {
  computed as _computed,
  ComputedRef,
  WritableComputedOptions,
  ReactiveEffect,
  WritableComputedRef
} from '@vue/reactivity'

import { currentInstance } from './component'

// 将每个计算属性的effect记录到实例的effects数组上，方便组件卸载时候清除effect
export function recordEffect(effect: ReactiveEffect) {
  if (currentInstance) {
    ;(currentInstance.effects || (currentInstance.effects = [])).push(effect)
  }
}

export function computed<T>(getter: () => T): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: (() => T) | WritableComputedOptions<T>
) {
  const c = _computed(getterOrOptions as any)
  // 计算属性返回值大概如此
  // {
  //   effect: ƒ reactiveEffect(...args)
  //   value: 2
  //   Symbol(refSymbol): true
  //   get value: ƒ value()
  //   set value: ƒ value(newValue)
  // }
  recordEffect(c.effect)
  return c
}
