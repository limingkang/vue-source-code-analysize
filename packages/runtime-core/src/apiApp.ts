import { Component, Data, validateComponentName } from './component'
import { ComponentOptions } from './apiOptions'
import { ComponentPublicInstance } from './componentProxy'
import { Directive } from './directives'
import { RootRenderFunction } from './createRenderer'
import { InjectionKey } from './apiInject'
import { isFunction, NO } from '@vue/shared'
import { warn } from './warning'
import { createVNode } from './vnode'

export interface App<HostElement = any> {
  config: AppConfig
  use(plugin: Plugin, options?: any): this
  mixin(mixin: ComponentOptions): this
  component(name: string): Component | undefined
  component(name: string, component: Component): this
  directive(name: string): Directive | undefined
  directive(name: string, directive: Directive): this
  mount(
    rootComponent: Component,
    rootContainer: HostElement,
    rootProps?: Data
  ): ComponentPublicInstance
  provide<T>(key: InjectionKey<T> | string, value: T): void
}

export interface AppConfig {
  devtools: boolean
  performance: boolean
  readonly isNativeTag?: (tag: string) => boolean
  isCustomElement?: (tag: string) => boolean
  errorHandler?: (
    err: Error,
    instance: ComponentPublicInstance | null,
    info: string
  ) => void
  warnHandler?: (
    msg: string,
    instance: ComponentPublicInstance | null,
    trace: string
  ) => void
}

export interface AppContext {
  config: AppConfig
  mixins: ComponentOptions[]
  components: Record<string, Component>
  directives: Record<string, Directive>
  provides: Record<string | symbol, any>
}

type PluginInstallFunction = (app: App) => any

export type Plugin =
  | PluginInstallFunction
  | {
      install: PluginInstallFunction
    }

export function createAppContext(): AppContext {
  return {
    config: {
      devtools: true,
      performance: false,
      isNativeTag: NO,
      isCustomElement: NO,
      errorHandler: undefined,
      warnHandler: undefined
    },
    mixins: [],
    components: {},
    directives: {},
    provides: {}
  }
}

export function createAppAPI<HostNode, HostElement>(
  render: RootRenderFunction<HostNode, HostElement>
): () => App<HostElement> {
  // Vue.createApp()运行此方法来创建app应用的时候实际上就是调用此方法，返回的是整个
  //App可以在全局注入使用的东西如mixin等
  return function createApp(): App {
    const context = createAppContext()

    let isMounted = false

    const app: App = {
      get config() {
        return context.config
      },

      set config(v) {
        if (__DEV__) {
          warn(
            `app.config cannot be replaced. Modify individual options instead.`
          )
        }
      },
      // 给框架拓展插件如vue-router等
      use(plugin: Plugin) {
        if (isFunction(plugin)) {
          plugin(app)
        } else if (isFunction(plugin.install)) {
          plugin.install(app)
        } else if (__DEV__) {
          warn(
            `A plugin must either be a function or an object with an "install" ` +
              `function.`
          )
        }
        return app
      },
      // 全局打入混合
      mixin(mixin: ComponentOptions) {
        context.mixins.push(mixin)
        return app
      },
      // 全局写入组件，如果有该组件则返回该组件，没有则注册并且返回当前app实例
      component(name: string, component?: Component): any {
        if (__DEV__) {
          validateComponentName(name, context.config)
        }
        if (!component) {
          return context.components[name]
        } else {
          context.components[name] = component
          return app
        }
      },
      // 全局注册指令
      directive(name: string, directive?: Directive) {
        // TODO directive name validation
        if (!directive) {
          return context.directives[name] as any
        } else {
          context.directives[name] = directive
          return app
        }
      },
      // 装载根组件并进行实例化
      mount(
        rootComponent: Component,
        rootContainer: string | HostElement,
        rootProps?: Data
      ): any {
        if (!isMounted) {
          const vnode = createVNode(rootComponent, rootProps)
          // store app context on the root VNode.
          // this will be set on the root instance on initial mount.
          vnode.appContext = context
          render(vnode, rootContainer)
          isMounted = true
          //console.log(vnode)
          return vnode.component!.renderProxy
        } else if (__DEV__) {
          warn(
            `App has already been mounted. Create a new app instance instead.`
          )
        }
      },
      // 全局依赖注入
      provide(key, value) {
        if (__DEV__ && key in context.provides) {
          warn(
            `App already provides property with key "${key}". ` +
              `It will be overwritten with the new value.`
          )
        }
        // TypeScript doesn't allow symbols as index type
        // https://github.com/Microsoft/TypeScript/issues/24587
        context.provides[key as string] = value
      }
    }

    return app
  }
}
