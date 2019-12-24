import { currentInstance } from './component'
import { warn } from './warning'

export interface InjectionKey<T> extends Symbol {}

export function provide<T>(key: InjectionKey<T> | string, value: T) {
  if (!currentInstance) {
    if (__DEV__) {
      warn(`provide() can only be used inside setup().`)
    }
  } else {
    let provides = currentInstance.provides
    // by default an instance inherits its parent's provides object
    // but when it needs to provide values of its own, it creates its
    // own provides object using parent provides object as prototype.
    // this way in `inject` we can simply look up injections from direct
    // parent and let the prototype chain do the work.
    const parentProvides =
      currentInstance.parent && currentInstance.parent.provides
    if (parentProvides === provides) {
      // 使用父组件的provides来作为自组件provides的原型，就可以同时访问到自己和父组件的provides值
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    // TS doesn't allow symbol as index type
    provides[key as string] = value
  }
}

export function inject<T>(key: InjectionKey<T> | string): T | undefined
export function inject<T>(key: InjectionKey<T> | string, defaultValue: T): T
export function inject(key: InjectionKey<any> | string, defaultValue?: any) {
  if (currentInstance) {
    // 就是从上面实例provides中取值，如果没有则使用默认值
    const provides = currentInstance.provides
    if (key in provides) {
      // TS doesn't allow symbol as index type
      return provides[key as string]
    } else if (defaultValue !== undefined) {
      return defaultValue
    } else if (__DEV__) {
      warn(`injection "${key}" not found.`)
    }
  } else if (__DEV__) {
    warn(`inject() can only be used inside setup().`)
  }
}
