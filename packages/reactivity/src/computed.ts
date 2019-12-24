import { effect, ReactiveEffect, activeReactiveEffectStack } from './effect'
import { Ref, refSymbol, UnwrapRef } from './ref'
import { isFunction, NOOP } from '@vue/shared'

export interface ComputedRef<T> extends WritableComputedRef<T> {
  readonly value: UnwrapRef<T>
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export interface WritableComputedOptions<T> {
  get: () => T
  set: (v: T) => void
}

export function computed<T>(getter: () => T): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: (() => T) | WritableComputedOptions<T>
): any {
  const isReadonly = isFunction(getterOrOptions)
  const getter = isReadonly
    ? (getterOrOptions as (() => T))
    : (getterOrOptions as WritableComputedOptions<T>).get
  const setter = isReadonly
    ? __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
    : (getterOrOptions as WritableComputedOptions<T>).set

  let dirty = true
  let value: T

  const runner = effect(getter, {
    lazy: true,
    // 凡事在此用这个属性标记为计算属性的在trigger触发更新时候都会优先执行
    computed: true,
    scheduler: () => {
      dirty = true
    }
  })
  return {
    [refSymbol]: true,
    // 暴露effect便于停止响应计算,看测试用例就明白了
    // it('should no longer update when stopped', () => {
    //   const value = reactive<{ foo?: number }>({})
    //   const cValue = computed(() => value.foo)
    //   let dummy
    //   effect(() => {
    //     dummy = cValue.value
    //   })
    //   expect(dummy).toBe(undefined)
    //   value.foo = 1
    //   expect(dummy).toBe(1)
    //   stop(cValue.effect)
    //   value.foo = 2
    //   expect(dummy).toBe(1)
    // })
    effect: runner,
    get value() {
      if (dirty) {
        value = runner()
        dirty = false
      }
      // 当需要被计算的effects能在父级effect访问的时候需要收集计算属性所有依赖
      // This should also apply for chained computed properties.
      trackChildRun(runner)
      return value
    },
    set value(newValue: T) {
      setter(newValue)
    }
  }
}
// let a = reactive({ b: 2, c: 3 })
// let b = computed(() => {
//   return a.b
// })
// let c = computed(() => {
//   return a.c
// })
// let dummy
// debugger
// const cc = effect(() => {
//   dummy = b.value + c.value
// })
// debugger
//可以debug看一下上面的代码, 就会发现cc.deps就是一个由b.deps和c.deps组成的数组。 其实看
//源码会发现computed就是一个特殊的ReactiveEffect
function trackChildRun(childRunner: ReactiveEffect) {
  const parentRunner =
    activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  if (parentRunner) {
    for (let i = 0; i < childRunner.deps.length; i++) {
      const dep = childRunner.deps[i]
      if (!dep.has(parentRunner)) {
        dep.add(parentRunner)
        parentRunner.deps.push(dep)
      }
    }
  }
}


// 总体来说computed用法大致如下：
// const value = reactive({ foo: 0 })
// const c1 = computed(() => value.foo)
// const c2 = computed(() => c1.value + 1)
// c2.value  // 1
// c1.value  // 0
// value.foo++
// c2.value  // 2
// c1.value  // 1
// // -------------
// const n = ref(1)
// const plusOne = computed({
//   get: () => n.value + 1,
//   set: val => {
//     n.value = val - 1
//   }
// })
// plusOne.value // 2
// plusOne.value = 1  // n.value : 0