# vue3响应式源码讲解

## reactive解析
``` js
//targetMap 类似 { target -> key -> dep } 的一个Map结构，用于缓存所有响应式对象和依赖收集
export const targetMap = new WeakMap<any, KeyToDepMap>()
export function reactive(target: object) {
  // 如果监听一个readonly代理，那么就直接返回该对象
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  if (readonlyValues.has(target)) {
    // 创建只读的代理属性方法，其本质也是createReactiveObject方法，只是传的参数不同
    return readonly(target)
  }
  return createReactiveObject(
    target,
    rawToReactive,  //用来存放代理数据的对象 rawToReactive.set(targert, proxy)
    reactiveToRaw,  //用来存放原始数据的对象 reactiveToRaw.set(proxy, targert)
    mutableHandlers,  //代理Object | Array时候
    mutableCollectionHandlers  // 代理Map | Set | WeakMap | WeakSet时候
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
  // 目标对象已经被代理, 因为我们可以不停的reactive值，防止代理同一个对象
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // 目标对象已经是一个被代理的对象
  if (toRaw.has(target)) {
    return target
  }
  // 是否可被observe
  // 对象符合以下配置:
  //   1. 不是Vue实例
  //   2. 不是虚拟DOM
  //   3. 是属于Object | Array | Map | Set | WeakMap | WeakSet其中一种
  //   4. 不存在于nonReactiveValues
  if (!canObserve(target)) {
    return target
  }
  // 如果目标对象是Map | Set | WeakMap | WeakSet其中一种，则使用collectionHandlers
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  // 保存proxy对象和原始对象
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  // 这里只是在targetMap保存该对象，之后在依赖收集track时候才给其对应的map赋值
  // map形式是set(属性对应的键 , new set()), 而set里面就是所有收集的effect
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  return observed
}
```
如果目标对象是Map | Set | WeakMap | WeakSet的话，由于他们能使用的方法是一定的，所有
只需要配置其get属性值即可, 使用collectionHandlers中方法配置
``` js
// 穷举了需要的属性，并且每个方法都有新的实现
const mutableInstrumentations: any = {
  get(key: any) {
    return get(this, key, toReactive)
  },
  get size() {
    return size(this)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false)
}
// 这里就看个add方法的实现
// ts就是如此如果要使用this上下文，就得传入，最终编译之后会去掉this参数function add(value){}
function add(this: any, value: any) {
  // 如果值或者上下文是reactive化了就返回对应值否则返回自身
  value = toRaw(value)
  const target = toRaw(this)
  const proto: any = Reflect.getPrototypeOf(this)
  // 从原型上找到此方法触发
  const hadKey = proto.has.call(target, value)
  const result = proto.add.call(target, value)
  if (!hadKey) {
    // 触发依赖
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.ADD, value, { value })
    } else {
      trigger(target, OperationTypes.ADD, value)
    }
  }
  return result
}
function createInstrumentationGetter(instrumentations: any) {
  return function getInstrumented(
    target: any,
    key: string | symbol,
    receiver: any
  ) {
    // 是对应实例
    target =
      hasOwn(instrumentations, key) && key in target ? instrumentations : target
    return Reflect.get(target, key, receiver)
  }
}
// 这里只监听了获取值即可
export const mutableCollectionHandlers: ProxyHandler<any> = {
  get: createInstrumentationGetter(mutableInstrumentations)
}
```

如果是普通的object或者array对象则使用baseHandlers.ts中mutableHandlers处理
``` js
export const mutableHandlers: ProxyHandler<any> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}
// 可以看到这里判断了 Reflect 返回的数据是否还是对象，如果是对象，则再走一次 proxy ，从而获得了对对
// 象内部的侦测, 这样就解决了只能代理一层的问题。注意proxy在这里的处理并不是递归。而是在使用这个数据
// 的时候会返回多个res, 这时候执行多次reactive, 在vue 2.x中先递归整个data，并为每一个属性设
// 置set和get。vue3中使用proxy则在使用数据时才设置set和get.并且，每一次的 proxy 数据，都会
// 保存在 Map 中，访问时会直接从中查找，从而提高性能。
function createGetter(isReadonly: boolean) {
  return function get(target: any, key: string | symbol, receiver: any) {
    const res = Reflect.get(target, key, receiver)
    if (isSymbol(key) && builtInSymbols.has(key)) {
      return res
    }
    if (isRef(res)) {
      return res.value
    }
    track(target, OperationTypes.GET, key)
    return isObject(res)
      ? isReadonly
        ? // 如果取到的值是个对象，将对象再代理包装一下
          // Proxy只能代理对象第一层级
          readonly(res)
        : reactive(res)
      : res
  }
}
// 来看一个比较重要的set方法
function set(
  target: any,
  key: string | symbol,
  value: any,
  receiver: any
): boolean {
  value = toRaw(value)
  const oldValue = target[key]
  if (isRef(oldValue) && !isRef(value)) {
    oldValue.value = value
    return true
  }
  // 是否是自身属性
  const hadKey = hasOwn(target, key)
  // 设置原始对象的值,返回的boolean值表示设置是否成功
  const result = Reflect.set(target, key, value, receiver)
  // 如果receiver存在于taRaw里，receiver是代理对象本身new proxy(target返回值)
  if (target === toRaw(receiver)) {
    /* istanbul ignore else */
    if (__DEV__) {
      const extraInfo = { oldValue, newValue: value }
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else if (value !== oldValue) {
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      // 如果没有属性值，则执行add方法
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key)
      } else if (value !== oldValue) {  //否则如果新旧值不同，则执行SET方法
        trigger(target, OperationTypes.SET, key)
      }
      // 通过以上判断可以解决数组重复执行set问题
    }
  }
  // 必须return是否设置成功否则报错
  return result
}
// let data = ['a', 'b']
// let r = reactive(data)
// r.push('c')
// // 打印一次 trigger add
// 执行r.push('c'), 会触发两次set, 第一次是设置新值'c', 第二次修改数组的length
// 当第一次触发时，这时侯key是2, hadKey为false, 所以打印trigger add
// 当第二次触发时，这时候key是length, hadKey为true, oldValue为3, value为3，所以只执行一次trigger
```


## ref解析
只可以监听Object | Array | Map | Set | WeakMap | WeakSet这几种, Proxy也没法劫持基本
数据).那我们如果就想让一个基本数据变为响应式,就把传入的基本数据包装成对象
``` js
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
const convert = (val: any): any => (isObject(val) ? reactive(val) : val)
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
```
还有一个使用场景,用来保持响应式
``` js
// 这里的文件的作用大致如下：
// 我们在对象解构和扩散运算符时, 对原对象的引用都会丢失.同样对于响应式的数据:
function useMousePosition() {
  const pos = reactive({
    x: 0,
    y: 0
  })
  // ...
  return pos
}
// consuming component
export default {
  setup() {
    // 响应式丢失!
    const { x, y } = useMousePosition()
    return {
      x,
      y
    }
    // 响应式丢失!------------------
    return {
      ...useMousePosition()
    }
    // 这是唯一能够保持响应式的办法,必须返回原先的引用--------------
    return {
      pos: useMousePosition()
    }
  }
}
// Vue3为我们提供了一个函数便是用于这种情况：
function useMousePosition() {
  const pos = reactive({
    x: 0,
    y: 0
  })
  return Vue.toRefs(pos)
}
// x & y 现在就是ref类型了，就可以像上面那样直接返回并且依旧保持响应式
const { x, y } = useMousePosition()

// 我们来看看toRefs方式的使用
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
```



## effect方法
运行effect方法就是创建一个数据响应系统的依赖
``` js
export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  if (isEffect(fn)) {
    fn = fn.raw
  }
  const effect = createReactiveEffect(fn, options)
  if (!options.lazy) { //表示是否立即执行fn函数
    effect()
  }
  return effect
}
function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: any[]): any {
    return run(effect, fn, args)
  } as ReactiveEffect
  effect[effectSymbol] = true
  effect.active = true
  effect.raw = fn
  effect.scheduler = options.scheduler
  effect.onTrack = options.onTrack
  effect.onTrigger = options.onTrigger
  effect.onStop = options.onStop
  effect.computed = options.computed
  effect.deps = []
  return effect
}
// 运行effect实际上就是运行此方法
function run(effect: ReactiveEffect, fn: Function, args: any[]): any {
  if (!effect.active) {
    return fn(...args)
  }
  if (!activeReactiveEffectStack.includes(effect)) {
    //试想一个场景:A组件与B组件是通过v - if来控制展示, 当A组件首先渲染之后, 所对应的的数据
    //就会采集对应的依赖, 此时更改v - if条件, 渲染了B组件, 若是B组件此时更改了A组件里的变
    //量, 若是A组件的依赖没有被清除掉, 那么会产生不必要的依赖调用, 所以Vue要事先清除掉所有
    //的依赖, 确保依赖始终是最新的
    // 实际上就是清空effect.deps
    cleanup(effect)
    // 初始化mount的时候会执行effect函数
    try {
      activeReactiveEffectStack.push(effect)
      return fn(...args)  
      //这里函数里有方法可以触发track方法的，例如取值等会触发track，那么在track方法中就可以通过
      // activeReactiveEffectStack来取到现在活跃运行的effect
    } finally {
      // 最终要清楚当前effect
      activeReactiveEffectStack.pop()
    }
  }
}
```
现在我们来看看依赖的收集和触发方法
``` js
// 依赖收集方法
export function track(
  target: any,
  type: OperationTypes,
  key?: string | symbol
) {
  if (!shouldTrack) {
    return
  }
  // 只有在依赖收集阶段才进行依赖收集
  // 除了render，其他场景也可能会触发Proxy的get，但不需要进行依赖收集
  // activeReactiveEffectStack栈顶包装了当前render的组件的mount和update的逻辑
  const effect = activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  if (!effect) {
    return
  }
  if (type === OperationTypes.ITERATE) {
    key = ITERATE_KEY
  }
  let depsMap = targetMap.get(target)
  if (depsMap === void 0) {
    targetMap.set(target, (depsMap = new Map()))
  }
  let dep = depsMap.get(key!)
  if (dep === void 0) {
    depsMap.set(key!, (dep = new Set()))
  }
  if (!dep.has(effect)) {
    // 这里将effect作为依赖，缓存到依赖列表
    //不止dep添加了, effect也添加了是为了给cleanup用来清除所有依赖用的
    dep.add(effect)
    effect.deps.push(dep)
    if (__DEV__ && effect.onTrack) {
      effect.onTrack({
        effect,
        target,
        type,
        key
      })
    }
  }
}
export function trigger(
  target: any,
  type: OperationTypes,
  key?: string | symbol,
  extraInfo?: any
) {
  // 获取对应target在track过程中缓存的依赖
  const depsMap = targetMap.get(target)
  if (depsMap === void 0) {
    // never been tracked
    return
  }
  // 保存所有effect
  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  if (type === OperationTypes.CLEAR) {
    // collection being cleared, trigger all effects for target
    depsMap.forEach(dep => {
      addRunners(effects, computedRunners, dep)
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    if (key !== void 0) {
      addRunners(effects, computedRunners, depsMap.get(key))
    }
    // also run for iteration key on ADD | DELETE
    if (type === OperationTypes.ADD || type === OperationTypes.DELETE) {
      const iterationKey = Array.isArray(target) ? 'length' : ITERATE_KEY
      addRunners(effects, computedRunners, depsMap.get(iterationKey))
    }
  }
  const run = (effect: ReactiveEffect) => {
    // 有个异步调度的过程，nextTick
    scheduleRun(effect, target, type, key, extraInfo)
  }
  //set值时要确保computed相关ReactiveEffect要先执行,否则就会使依赖这些computed的effects失效
  computedRunners.forEach(run)
  effects.forEach(run)
}
// computed ReactiveEffect执行时机
// let a = reactive({ b: 2 })
// let b = computed(() => {
//   return a.b
// })
// let dummy;
// const c = effect(() => {
//   dummy = b.value
// })
// console.log(dummy) // 2
// a.b = 0
// console.log(dummy) // 0
// console.log(b.value) // 0
// 而当我们将Vue3的代码改为调换下顺序:
//   effects.forEach(run)
//   computedRunners.forEach(run)
// 上段代码的执行结果就会变为 2 2 0

// 添加执行任务
function addRunners(
  effects: Set<ReactiveEffect>,
  computedRunners: Set<ReactiveEffect>,
  effectsToAdd: Set<ReactiveEffect> | undefined
) {
  if (effectsToAdd !== void 0) {
    effectsToAdd.forEach(effect => {
      if (effect.computed) {
        computedRunners.add(effect)
      } else {
        effects.add(effect)
      }
    })
  }
}

function scheduleRun(
  effect: ReactiveEffect,
  target: any,
  type: OperationTypes,
  key: string | symbol | undefined,
  extraInfo: any
) {
  if (__DEV__ && effect.onTrigger) {
    effect.onTrigger(
      extend(
        {
          effect,
          target,
          key,
          type
        },
        extraInfo
      )
    )
  }
  //这里的scheduler就是Vue的性能优化点，放入队里里, 等到miscroTask里进行调用
  //这个scheduler可以看做就是调用了nextTick函数
  if (effect.scheduler !== void 0) {
    effect.scheduler(effect)
  } else {
    effect()
  }
}
```





## computed方法
``` js
// 总体来说computed用法大致如下：
const value = reactive({ foo: 0 })
const c1 = computed(() => value.foo)
const c2 = computed(() => c1.value + 1)
c2.value  // 1
c1.value  // 0
value.foo++
c2.value  // 2
c1.value  // 1
// -------------
const n = ref(1)
const plusOne = computed({
  get: () => n.value + 1,
  set: val => {
    n.value = val - 1
  }
})
plusOne.value // 2
plusOne.value = 1  // n.value : 0
```

``` js
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
```















