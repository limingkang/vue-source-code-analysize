import { OperationTypes } from './operations'
import { Dep, targetMap } from './reactive'
import { EMPTY_OBJ, extend } from '@vue/shared'

export const effectSymbol = Symbol(__DEV__ ? 'effect' : void 0)

export interface ReactiveEffect<T = any> {
  (): T
  [effectSymbol]: true
  active: boolean
  raw: () => T
  deps: Array<Dep>
  computed?: boolean
  scheduler?: (run: Function) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}
// ReactiveEffect 一个Function对象，用于执行组件的挂载和更新
export interface ReactiveEffectOptions {
  lazy?: boolean
  computed?: boolean
  scheduler?: (run: Function) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}

export interface DebuggerEvent {
  effect: ReactiveEffect
  target: any
  type: OperationTypes
  key: string | symbol | undefined
}
// 始终表示当前运行的effect而且从后面push进去的所以可以从数组最后一个值取到
export const activeReactiveEffectStack: ReactiveEffect[] = []

export const ITERATE_KEY = Symbol('iterate')

export function isEffect(fn: any): fn is ReactiveEffect {
  return fn != null && fn[effectSymbol] === true
}
//运行effect方法就是创建一个数据响应系统
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

export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    cleanup(effect)
    if (effect.onStop) {
      effect.onStop()
    }
    effect.active = false
  }
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

function run(effect: ReactiveEffect, fn: Function, args: any[]): any {
  if (!effect.active) {
    return fn(...args)
  }
  if (!activeReactiveEffectStack.includes(effect)) {
    //试想一个场景:A组件与B组件是通过v - if来控制展示, 当A组件首先渲染之后, 所对应的的数据
    //就会采集对应的依赖, 此时更改v - if条件, 渲染了B组件, 若是B组件此时更改了A组件里的变
    //量, 若是A组件的依赖没有被清除掉, 那么会产生不必要的依赖调用, 所以Vue要事先清除掉所有
    //的依赖, 确保依赖始终是最新的
    cleanup(effect)
    // 初始化mount的时候会执行effect函数
    try {
      activeReactiveEffectStack.push(effect)
      return fn(...args)  
      //这里加入函数里有方法可以触发track方法啥的的就可以通过activeReactiveEffectStack
      //来取到现在活跃运行的effect,因为先运算fn方法的
    } finally {
      activeReactiveEffectStack.pop()
    }
  }
}
// 1、不管有木有出现异常，finally块中代码都会执行；
// 2、当try和catch中有return时，finally仍然会执行；
// 3、finally是在return后面的表达式运算后执行的（此时并没有返回运算后的值，而
// //是先把要返回的值保存起来，管finally中的代码怎么样，返回的值都不会改变，任然是之前保存的值），所
// //以函数返回值是在finally执行前确定的；
// 4、finally中最好不要包含return，否则程序会提前退出，返回值不是try或catch中保存的返回值。

function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}
//定义了一个shouldTrack, 这个变量是用来控制调用生命周期的时候的开关，防止触发多次
let shouldTrack = true

export function pauseTracking() {
  shouldTrack = false
}

export function resumeTracking() {
  shouldTrack = true
}

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