import { ComponentInternalInstance, Data } from './component'
import { nextTick } from './scheduler'
import { instanceWatch } from './apiWatch'
import { EMPTY_OBJ, hasOwn, isGloballyWhitelisted } from '@vue/shared'
import { ExtractComputedReturns } from './apiOptions'
import { UnwrapRef, ReactiveEffect } from '@vue/reactivity'
import { warn } from './warning'

// public properties exposed on the proxy, which is used as the render context
// in templates (as `this` in the render option)
export type ComponentPublicInstance<
  P = {},
  B = {},
  D = {},
  C = {},
  M = {},
  PublicProps = P
> = {
  [key: string]: any
  $data: D
  $props: PublicProps
  $attrs: Data
  $refs: Data
  $slots: Data
  $root: ComponentInternalInstance | null
  $parent: ComponentInternalInstance | null
  $emit: (event: string, ...args: unknown[]) => void
  $el: any
  $options: any
  $forceUpdate: ReactiveEffect
  $nextTick: typeof nextTick
  $watch: typeof instanceWatch
} & P &
  UnwrapRef<B> &
  D &
  ExtractComputedReturns<C> &
  M

const publicPropertiesMap = {
  $data: 'data',
  $props: 'propsProxy',
  $attrs: 'attrs',
  $slots: 'slots',
  $refs: 'refs',
  $parent: 'parent',
  $root: 'root',
  $emit: 'emit',
  $options: 'type'
}
// 构造整个组件内部实例的代理，其值绑定在内部实例的renderProxy属性上mount之后也是返回的该值
export const PublicInstanceProxyHandlers: ProxyHandler<any> = {
  get(target: ComponentInternalInstance, key: string) {
    const { renderContext, data, props, propsProxy } = target
    // renderContext组件内部setup函数运行之后返回值的reactive话的返回值即reactive(setup())
    // data实际上是为了支持2.0的写法，如果没有setup方法，但是有data方法的话，就reactive(data()),并绑定到实例的data上
    if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      return data[key]
    } else if (hasOwn(renderContext, key)) {
      return renderContext[key]
    } else if (hasOwn(props, key)) {
      // return the value from propsProxy for ref unwrapping and readonly
      return propsProxy![key]
    } else if (key === '$el') {
      return target.vnode.el
    } else if (hasOwn(publicPropertiesMap, key)) {
      return target[publicPropertiesMap[key]]
    }
    // methods are only exposed when options are supported
    if (__FEATURE_OPTIONS__) {
      switch (key) {
        case '$forceUpdate':
          return target.update
        case '$nextTick':
          return nextTick
        case '$watch':
          return instanceWatch.bind(target)
      }
    }
    return target.user[key]
  },

  set(target: ComponentInternalInstance, key: string, value: any): boolean {
    const { data, renderContext } = target
    if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value
    } else if (hasOwn(renderContext, key)) {
      renderContext[key] = value
    } else if (key[0] === '$' && key.slice(1) in target) {
      __DEV__ &&
        warn(
          `Attempting to mutate public property "${key}". ` +
            `Properties starting with $ are reserved and readonly.`,
          target
        )
      return false
    } else if (key in target.props) {
      __DEV__ &&
        warn(`Attempting to mutate prop "${key}". Props are readonly.`, target)
      return false
    } else {
      target.user[key] = value
    }
    return true
  }
}

if (__RUNTIME_COMPILE__) {
  // this trap is only called in browser-compiled render functions that use
  // `with (this) {}`
  PublicInstanceProxyHandlers.has = (_: any, key: string): boolean => {
    return key[0] !== '_' && !isGloballyWhitelisted(key)
  }
}
