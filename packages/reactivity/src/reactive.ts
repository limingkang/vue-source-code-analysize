import { isObject, toTypeString } from '@vue/shared'
import { mutableHandlers, readonlyHandlers } from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'
import { ReactiveEffect } from './effect'
import { UnwrapRef, Ref } from './ref'

// map的健可以是其他任何类型
// var first = new Map([
//   [1, 'one'],
// ]);
// var second = new Map([
//   [1, 'uno'],
//   [2, 'dos'],
//   ['tst', 'faf']
// ]);
// // 合并两个Map对象时，如果有重复的键值，则后面的会覆盖前面的。
// // 展开运算符本质上是将Map对象转换成数组。
// var merged = new Map([...first, ...second]);
// console.log(merged.get(1)); // eins
// console.log(merged.get(2)); // dos
// console.log(merged.get('tst')); // faf
// WeakMap可以给初始化默认值而且健只能是对象形式
// const a = { b: 4 }
// const weakmap = new WeakMap([[a, 1]])
// console.log(weakmap.get(a))  //1


// targetMap 类似 { target -> key -> dep } 的一个Map结构，用于缓存所有响应式对象和依赖收集
export type Dep = Set<ReactiveEffect>
export type KeyToDepMap = Map<string | symbol, Dep>
export const targetMap = new WeakMap<any, KeyToDepMap>()

// WeakMaps that store {raw <-> observed} pairs.
const rawToReactive = new WeakMap<any, any>() // 用来存放代理数据的对象
const reactiveToRaw = new WeakMap<any, any>() // 用来存放原始数据的对象
const rawToReadonly = new WeakMap<any, any>()
const readonlyToRaw = new WeakMap<any, any>()

// WeakSets for values that are marked readonly or non-reactive during
// observable creation.
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>()

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const observableValueRE = /^\[object (?:Object|Array|Map|Set|WeakMap|WeakSet)\]$/
// 对象符合以下配置:
//   1. 不是Vue实例
//   2. 不是虚拟DOM
//   3. 是属于Object | Array | Map | Set | WeakMap | WeakSet其中一种
//   4. 不存在于nonReactiveValues
const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    observableValueRE.test(toTypeString(value)) &&
    !nonReactiveValues.has(value)
  )
}

// only unwrap nested ref
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>
// reactive函数执行，会将传入的target对象通过Proxy包装，拦截它的get，set等，并将代理的
// target缓存到targetMap，targetMap.set(target, new Map())
// 代理的get的时候会调用一个track函数，而set会调用一个triger函数。分别对应依赖收集和触发更新
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  // value is a mutable observable, retrieve its original and return
  // a readonly version.
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

function createReactiveObject(
  target: any,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // 目标对象已经被代理
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // 目标对象已经是一个被代理的对象
  if (toRaw.has(target)) {
    return target
  }
  // 是否可被observe
  if (!canObserve(target)) {
    return target
  }
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  // 保存proxy对象和原始对象
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  return observed
}

export function isReactive(value: any): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

export function isReadonly(value: any): boolean {
  return readonlyToRaw.has(value)
}

export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
