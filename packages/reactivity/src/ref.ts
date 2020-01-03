import { track, trigger } from './effect'
import { OperationTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive } from './reactive'
import { ComputedRef } from './computed'

export const refSymbol = Symbol(__DEV__ ? 'refSymbol' : '')

export interface Ref<T = any> {
  [refSymbol]: true
  value: UnwrapRef<T>
}
// 只可以监听Object | Array | Map | Set | WeakMap | WeakSet这几种, Proxy也没法劫持基本
// 数据).那我们如果就想让一个基本数据变为响应式,就把传入的基本数据包装成对象
const convert = (val: any): any => (isObject(val) ? reactive(val) : val)
// const count = ref(0)
// console.log(count.value) // 0

// count.value++
// console.log(count.value) // 1
// ----------
// const a = ref(1)
// effect(() => {
//   console.log(a.value)
// })
// a.value = 2
// ----------------------------
// const { ref, reactive, effect } = Vue
// const a = ref({ c: 1 })
// effect(() => {
//   console.log(a.value.c)
// })
// a.value.c = 2  // 打印2
// a.value = { c: 3 }  // 打印3
//这里在执行effct函数时其中的()=> { console.log(a.value.c) } ReactiveEffect其实会被
//分别存在key为“”（ref存ReactiveEffect的key都是""）和key为c的的depSet中, 因为同时
//get了value和c。 所以修改c和value都会触发相同的ReactiveEffect的执行
export function ref<T extends Ref>(raw: T): T
export function ref<T>(raw: T): Ref<T>
export function ref(raw: any) {
  if (isRef(raw)) {
    return raw
  }
  raw = convert(raw)
  const v = {
    [refSymbol]: true,
    get value() {
      // 注意！ 这里ref绑定的key为‘’(空字符串),这个是可以的因为用的是Map存储
      track(v, OperationTypes.GET, '')
      return raw
    },
    set value(newVal) {
      raw = convert(newVal)
      trigger(v, OperationTypes.SET, '')
    }
  }
  return v as Ref
}

export function isRef(v: any): v is Ref {
  return v ? v[refSymbol] === true : false
}

export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}
// 该方法给toRefs方法使用，用来保持响应式不丢失，下面代码可详细记录
function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  return {
    [refSymbol]: true,
    get value(): any {
      //让他触发原对象的响应式
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  }
}

type BailTypes =
  | Function
  | Map<any, any>
  | Set<any>
  | WeakMap<any, any>
  | WeakSet<any>

// Recursively unwraps nested value bindings.
export type UnwrapRef<T> = {
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> : T
  object: { [K in keyof T]: UnwrapRef<T[K]> }
  stop: T
}[T extends ComputedRef<any>
  ? 'cRef'
  : T extends Ref
    ? 'ref'
    : T extends Array<any>
      ? 'array'
      : T extends BailTypes
        ? 'stop' // bail out on types that shouldn't be unwrapped
        : T extends object ? 'object' : 'stop']

// 这里的文件的作用大致如下：
// 我们在对象解构和扩散运算符时, 对原对象的引用都会丢失.同样对于响应式的数据:
// function useMousePosition() {
//   const pos = reactive({
//     x: 0,
//     y: 0
//   })
//   // ...
//   return pos
// }
// // consuming component
// export default {
//   setup() {
//     // 响应式丢失!
//     const { x, y } = useMousePosition()
//     return {
//       x,
//       y
//     }
//     // 响应式丢失!------------------
//     return {
//       ...useMousePosition()
//     }
//     // 这是唯一能够保持响应式的办法,必须返回原先的引用--------------
//     return {
//       pos: useMousePosition()
//     }
//   }
// }
// Vue3为我们提供了一个函数便是用于这种情况：
// function useMousePosition() {
//   const pos = reactive({
//     x: 0,
//     y: 0
//   })
//   return Vue.toRefs(pos)
// }
// // x & y 现在就是ref类型了，就可以像上面那样直接返回并且依旧保持响应式
// const { x, y } = useMousePosition()
