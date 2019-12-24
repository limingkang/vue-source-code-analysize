// 主要是构造proxy的处理参数对象，导出可改变的proxyhandler和不可改变的两种构造handler
import { reactive, readonly, toRaw } from './reactive'
import { OperationTypes } from './operations'
import { track, trigger } from './effect'
import { LOCKED } from './lock'
import { isObject, hasOwn, isSymbol } from '@vue/shared'
import { isRef } from './ref'
// const test = Object.getOwnPropertyNames(Symbol).map(key => Symbol[key]).filter(val => typeof val === "symbol");
// const symbol1 = new Set(test);
// console.log(typeof Symbol.asyncIterator);
// console.log(test);
// console.log(symbol1.has(Symbol.asyncIterator));
// // "symbol"
// // Array[Symbol(Symbol.asyncIterator), Symbol(Symbol.hasInstance), Symbol(Symbol.isConcatSpreadable), Symbol(Symbol.iterator), Symbol(Symbol.match), Symbol(Symbol.matchAll), Symbol(Symbol.replace), Symbol(Symbol.search), Symbol(Symbol.species), Symbol(Symbol.split), Symbol(Symbol.toPrimitive), Symbol(Symbol.toStringTag), Symbol(Symbol.unscopables)]
// // true
// Symbol.toStringTag 是一个内置 symbol，它通常作为对象的属性键使用，对应的属性值应该为字符串类型，
// 这个字符串用来表示该对象的自定义类型标签，通常只有内置的 Object.prototype.toString() 方法会去
// 读取这个标签并把它包含在自己的返回值里
// 但你自己创建的类不会有这份特殊待遇，toString() 找不到 toStringTag 属性时只好返回默认的 Object 标签：
// class ValidatorClass { }
// Object.prototype.toString.call(new ValidatorClass()); // "[object Object]"
// 加上 toStringTag 属性，你的类也会有自定义的类型标签了
// class ValidatorClass {
//   get [Symbol.toStringTag]() {
//     return "Validator";
//   }
// }
// Object.prototype.toString.call(new ValidatorClass()); // "[object Validator]"

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

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
// 可以看到这里判断了 Reflect 返回的数据是否还是对象，如果是对象，则再走一次 proxy ，从而获得了对对
// 象内部的侦测, 这样就解决了只能代理一层的问题。注意proxy在这里的处理并不是递归。而是在使用这个数据
// 的时候会返回多个res, 这时候执行多次reactive, 在vue 2.x中先递归整个data，并为每一个属性设
// 置set和get。vue3中使用proxy则在使用数据时才设置set和get.并且，每一次的 proxy 数据，都会
// 保存在 Map 中，访问时会直接从中查找，从而提高性能。

// 假设现在传入 reactive 函数的数据是:
//   const origin = {
//     count: 0,
//     a: { b: 0 }
//   }
//   const state = reactive(origin)
// 当我对这个对象内部属性操作时，例如 state.a.b = 6，这个时候，get 会被触发两次，而 Reflect.get会返
// 回两个 res ，分别是data 的内层结构 { b: 0 } 和 0，这两个res，若是对象会重新 new Proxy 来代理，
// 并且存入 map 中。如果是递归proxy，那么 data 的每一层都会是 proxy 对象。而这里，proxy 对象是两
// 个 { b: 0 } 和{ count: 0, a: { b: 0 } } ，每个代理对象只有外层是 proxy 的

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
  const hadKey = hasOwn(target, key)
  // 设置原始对象的值,返回的boolean值表示设置是否成功
  const result = Reflect.set(target, key, value, receiver)
  // 如果目标在原型链上，不要触发
  // 如果receiver存在于taRaw里，即receiver是proxy,即不再原型链上
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
  return result
}
// let data = ['a', 'b']
// let r = reactive(data)
// r.push('c')
// // 打印一次 trigger add
// 执行r.push('c'), 会触发两次set, 第一次是设置新值'c', 第二次修改数组的length
// 当第一次触发时，这时侯key是2, hadKey为false, 所以打印trigger add
// 当第二次触发时，这时候key是length, hadKey为true, oldValue为3, value为3，所以只执行一次trigger

function deleteProperty(target: any, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = target[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  return result
}

function has(target: any, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, OperationTypes.HAS, key)
  return result
}

function ownKeys(target: any): (string | number | symbol)[] {
  track(target, OperationTypes.ITERATE)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<any> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<any> = {
  get: createGetter(true),

  set(target: any, key: string | symbol, value: any, receiver: any): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Set operation on key "${String(key)}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return set(target, key, value, receiver)
    }
  },

  deleteProperty(target: any, key: string | symbol): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Delete operation on key "${String(
            key
          )}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return deleteProperty(target, key)
    }
  },

  has,
  ownKeys
}
