import {
  ComponentInternalInstance,
  Data,
  Component,
  SetupContext
} from './component'
import {
  isFunction,
  extend,
  isString,
  isObject,
  isArray,
  EMPTY_OBJ,
  NOOP
} from '@vue/shared'
import { computed } from './apiReactivity'
import { watch, WatchOptions, CleanupRegistrator } from './apiWatch'
import { provide, inject } from './apiInject'
import {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onErrorCaptured,
  onRenderTracked,
  onBeforeUnmount,
  onUnmounted,
  onRenderTriggered,
  DebuggerHook,
  ErrorCapturedHook
} from './apiLifecycle'
import { reactive } from '@vue/reactivity'
import { ComponentObjectPropsOptions, ExtractPropTypes } from './componentProps'
import { Directive } from './directives'
import { VNodeChild } from './vnode'
import { ComponentPublicInstance } from './componentProxy'
import { warn } from './warning'

interface ComponentOptionsBase<
  Props,
  RawBindings,
  D,
  C extends ComputedOptions,
  M extends MethodOptions
> extends LegacyOptions<Props, RawBindings, D, C, M> {
  setup?: (
    this: null,
    props: Props,
    ctx: SetupContext
  ) => RawBindings | (() => VNodeChild) | void
  name?: string
  template?: string
  // Note: we are intentionally using the signature-less `Function` type here
  // since any type with signature will cause the whole inference to fail when
  // the return expression contains reference to `this`.
  // Luckily `render()` doesn't need any arguments nor does it care about return
  // type.
  render?: Function
  components?: Record<string, Component>
  directives?: Record<string, Directive>
}

export type ComponentOptionsWithoutProps<
  Props = {},
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {}
> = ComponentOptionsBase<Props, RawBindings, D, C, M> & {
  props?: undefined
} & ThisType<ComponentPublicInstance<Props, RawBindings, D, C, M>>

export type ComponentOptionsWithArrayProps<
  PropNames extends string = string,
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Props = { [key in PropNames]?: unknown }
> = ComponentOptionsBase<Props, RawBindings, D, C, M> & {
  props: PropNames[]
} & ThisType<ComponentPublicInstance<Props, RawBindings, D, C, M>>

export type ComponentOptionsWithObjectProps<
  PropsOptions = ComponentObjectPropsOptions,
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Props = ExtractPropTypes<PropsOptions>
> = ComponentOptionsBase<Props, RawBindings, D, C, M> & {
  props: PropsOptions
} & ThisType<ComponentPublicInstance<Props, RawBindings, D, C, M>>

export type ComponentOptions =
  | ComponentOptionsWithoutProps
  | ComponentOptionsWithObjectProps
  | ComponentOptionsWithArrayProps

// TODO legacy component definition also supports constructors with .options
type LegacyComponent = ComponentOptions

export interface ComputedOptions {
  [key: string]:
    | Function
    | {
        get: Function
        set: Function
      }
}

export interface MethodOptions {
  [key: string]: Function
}

export type ExtractComputedReturns<T extends any> = {
  [key in keyof T]: T[key] extends { get: Function }
    ? ReturnType<T[key]['get']>
    : ReturnType<T[key]>
}

export type WatchHandler<T = any> = (
  val: T,
  oldVal: T,
  onCleanup: CleanupRegistrator
) => any

type ComponentWatchOptions = Record<
  string,
  string | WatchHandler | { handler: WatchHandler } & WatchOptions
>

type ComponentInjectOptions =
  | string[]
  | Record<
      string | symbol,
      string | symbol | { from: string | symbol; default?: any }
    >

// TODO type inference for these options
export interface LegacyOptions<
  Props,
  RawBindings,
  D,
  C extends ComputedOptions,
  M extends MethodOptions
> {
  el?: any

  // state
  // Limitation: we cannot expose RawBindings on the `this` context for data
  // since that leads to some sort of circular inference and breaks ThisType
  // for the entire component.
  data?: D | ((this: ComponentPublicInstance<Props>) => D)
  computed?: C
  methods?: M
  // TODO watch array
  watch?: ComponentWatchOptions
  provide?: Data | Function
  inject?: ComponentInjectOptions

  // composition
  mixins?: LegacyComponent[]
  extends?: LegacyComponent

  // lifecycle
  beforeCreate?(): void
  created?(): void
  beforeMount?(): void
  mounted?(): void
  beforeUpdate?(): void
  updated?(): void
  activated?(): void
  deactivated?(): void
  beforeUnmount?(): void
  unmounted?(): void
  renderTracked?: DebuggerHook
  renderTriggered?: DebuggerHook
  errorCaptured?: ErrorCapturedHook
}

export function applyOptions(
  instance: ComponentInternalInstance,
  options: ComponentOptions,
  asMixin: boolean = false
) {
  const renderContext =
    instance.renderContext === EMPTY_OBJ
      ? (instance.renderContext = reactive({}))
      : instance.renderContext
  const ctx = instance.renderProxy!
  const {
    // composition
    mixins,
    extends: extendsOptions,
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // assets
    components,
    directives,
    // lifecycle
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    // TODO activated
    // TODO deactivated
    beforeUnmount,
    unmounted,
    renderTracked,
    renderTriggered,
    errorCaptured
  } = options

  const globalMixins = instance.appContext.mixins
  // applyOptions is called non-as-mixin once per instance
  if (!asMixin) {
    callSyncHook('beforeCreate', options, ctx, globalMixins)
    // 全局mixin一个实例上只需要载入一次
    applyMixins(instance, globalMixins)
  }
  // extends参数存储基础组件component
  // extends: {
  //   data() {
  //     return {
  //       a: 1
  //     }
  //   },
  //   mounted() {
  //     calls.push('base')
  //   }
  // }
  if (extendsOptions) {
    // 作为基础组件不需要再次载入全局mixin
    applyOptions(instance, extendsOptions, true)
  }
  // 本地mixins参数存在
  if (mixins) {
    applyMixins(instance, mixins)
  }
  // 初始化传入里面有data函数
  if (dataOptions) {
    const data = isFunction(dataOptions) ? dataOptions.call(ctx) : dataOptions
    if (!isObject(data)) {
      __DEV__ && warn(`data() should return an object.`)
    } else if (instance.data === EMPTY_OBJ) {
      // 函数返回值进行reactive化,并绑定到实例的data上面
      instance.data = reactive(data)
    } else {
      // 如果该组件中有mixins和extends基础组件参数那么data值必然已经被赋值了
      extend(instance.data, data)
    }
  }
  //  处理计算属性绑定到renderContext
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = (computedOptions as ComputedOptions)[key]

      if (isFunction(opt)) {
        renderContext[key] = computed(opt.bind(ctx))
      } else {
        // 不是函数支持自定义get set
        const { get, set } = opt
        if (isFunction(get)) {
          renderContext[key] = computed({
            get: get.bind(ctx),
            set: isFunction(set)
              ? set.bind(ctx)
              : __DEV__
                ? () => {
                    warn(
                      `Computed property "${key}" was assigned to but it has no setter.`
                    )
                  }
                : NOOP
          })
        } else if (__DEV__) {
          warn(`Computed property "${key}" has no getter.`)
        }
      }
    }
  }
  // 处理组件内部方法也绑定到renderContext
  if (methods) {
    for (const key in methods) {
      renderContext[key] = (methods as MethodOptions)[key].bind(ctx)
    }
  }
  // 监听参数watch大概以下几种格式
  // watch: {
  //   watchvalue: 'inMethodWay'  //methond里面的方法名字
  //   watchvalue: function(val, oldval) { }
  //   watchvalue: {
  //     handler: function(val, oldval) {
  //       console.log(val.name)
  //     },
  //     deep: true
  //   }
  // }
  if (watchOptions) {
    for (const key in watchOptions) {
      const raw = watchOptions[key]
      const getter = () => ctx[key]
      if (isString(raw)) {
        const handler = renderContext[raw]
        if (isFunction(handler)) {
          watch(getter, handler as WatchHandler)
        } else if (__DEV__) {
          warn(`Invalid watch handler specified by key "${raw}"`, handler)
        }
      } else if (isFunction(raw)) {
        watch(getter, raw.bind(ctx))
      } else if (isObject(raw)) {
        // TODO 2.x compat
        watch(getter, raw.handler.bind(ctx), raw)
      } else if (__DEV__) {
        warn(`Invalid watch option: "${key}"`)
      }
    }
  }
  // 值都绑定到实例的provides上面
  if (provideOptions) {
    const provides = isFunction(provideOptions)
      ? provideOptions.call(ctx)
      : provideOptions
    for (const key in provides) {
      provide(key, provides[key])
    }
  }
  // provides提供的值最终都绑定到renderContext上面
  if (injectOptions) {
    if (isArray(injectOptions)) {
      for (let i = 0; i < injectOptions.length; i++) {
        const key = injectOptions[i]
        renderContext[key] = inject(key)
      }
    } else {
      for (const key in injectOptions) {
        const opt = injectOptions[key]
        if (isObject(opt)) {
          renderContext[key] = inject(opt.from, opt.default)
        } else {
          renderContext[key] = inject(opt)
        }
      }
    }
  }
  // asset options
  if (components) {
    extend(instance.components, components)
  }
  if (directives) {
    extend(instance.directives, directives)
  }

  // lifecycle options
  if (!asMixin) {
    callSyncHook('created', options, ctx, globalMixins)
  }
  if (beforeMount) {
    onBeforeMount(beforeMount.bind(ctx))
  }
  if (mounted) {
    onMounted(mounted.bind(ctx))
  }
  if (beforeUpdate) {
    onBeforeUpdate(beforeUpdate.bind(ctx))
  }
  if (updated) {
    onUpdated(updated.bind(ctx))
  }
  if (errorCaptured) {
    onErrorCaptured(errorCaptured.bind(ctx))
  }
  if (renderTracked) {
    onRenderTracked(renderTracked.bind(ctx))
  }
  if (renderTriggered) {
    onRenderTriggered(renderTriggered.bind(ctx))
  }
  if (beforeUnmount) {
    onBeforeUnmount(beforeUnmount.bind(ctx))
  }
  if (unmounted) {
    onUnmounted(unmounted.bind(ctx))
  }
}

function callSyncHook(
  name: 'beforeCreate' | 'created',
  options: ComponentOptions,
  ctx: any,
  globalMixins: ComponentOptions[]
) {
  callHookFromMixins(name, globalMixins, ctx)
  const baseHook = options.extends && options.extends[name]
  if (baseHook) {
    baseHook.call(ctx)
  }
  const mixins = options.mixins
  if (mixins) {
    callHookFromMixins(name, mixins, ctx)
  }
  const selfHook = options[name]
  if (selfHook) {
    selfHook.call(ctx)
  }
}

function callHookFromMixins(
  name: 'beforeCreate' | 'created',
  mixins: ComponentOptions[],
  ctx: any
) {
  for (let i = 0; i < mixins.length; i++) {
    const fn = mixins[i][name]
    if (fn) {
      fn.call(ctx)
    }
  }
}

function applyMixins(
  instance: ComponentInternalInstance,
  mixins: ComponentOptions[]
) {
  for (let i = 0; i < mixins.length; i++) {
    applyOptions(instance, mixins[i], true)
  }
}
