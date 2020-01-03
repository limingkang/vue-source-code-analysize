# 渲染到页面流程介绍

## 一个简单的示例说明下流程
``` js
const RootComponent = {
  template: `
    <div>test</div>
    <p :class="state.name">
      Count is
    </p>
    <div v-for="value in state.fordata">
        {{value}}
    </div>
    <button @click="increment" v-if="state.show">
      Count is: {{ state.count }}
    </button>
  `,
  setup() {
    const state = Vue.reactive({
      name:'test',
      count: 2,
      show: true,
      fordata: [222, 333, 4444]
    })
    function increment() {
      state.count++
    }

    return {
      state,
      increment
    }
  }
}
Vue.createApp().mount(RootComponent, '#container')
```
根据这段代码示例我们看下流程，由上面分析可以，先触发render函数就是触发里面的补丁path函数，我们可
以简单看下这个函数的，主要根据vnode节点类型来加工不同的vnode
``` js
function patch(
    n1: HostVNode | null, // 如果为空就是要装载这个组件
    n2: HostVNode,
    container: HostElement,
    anchor: HostNode | null = null,
    parentComponent: ComponentInternalInstance | null = null,
    parentSuspense: HostSuspenseBoundary | null = null,
    isSVG: boolean = false,
    optimized: boolean = false
  ) {
    // patching & not same type, unmount old tree
    if (n1 != null) {
      if (!isSameType(n1, n2)) {
        anchor = getNextHostNode(n1)
        unmount(n1, parentComponent, parentSuspense, true)
        n1 = null
      } else if (n1.props && n1.props.$once) {
        return
      }
    }
    const { type, shapeFlag } = n2
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor)
        break
      case Comment:
        processCommentNode(n1, n2, container, anchor)
        break
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        break
      case Portal:
        processPortal(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        break
      case Suspense:
        if (__FEATURE_SUSPENSE__) {
          processSuspense(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else if (__DEV__) {
          warn(`Suspense is not enabled in the version of Vue you are using.`)
        }
        break
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else if (__DEV__) {
          warn('Invalid HostVNode type:', n2.type, `(${typeof n2.type})`)
        }
    }
  }
```
由上面可知我们要加工组件vnode所以就使用此方法processComponent，这个方法包含了组件载入组件跟新等
一系列和组件有关方法，这里看逻辑可知触发里面的mountComponent方法
``` js
// 简化之后的大概方法如下
function mountComponent(
  initialVNode: HostVNode,
  container: HostElement,
  anchor: HostNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: HostSuspenseBoundary | null,
  isSVG: boolean
) {
  // component.ts中createComponentInstance方法生成组件实例并挂载到vnode.component
  // 组件内部实例的vnode对象也会记住组件初始化实例
  // 里面还包含很多其他为空的键如subTree已经生命周期等定义虽然都为空
  const instance: ComponentInternalInstance = (initialVNode.component = createComponentInstance(
    initialVNode,
    parentComponent
  ))
  // 处理props and slots for setup context
  const propsOptions = (initialVNode.type as Component).props
  resolveProps(instance, initialVNode.props, propsOptions)
  resolveSlots(instance, initialVNode.children)

  // 装载组件的状态逻辑
  if (initialVNode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
    setupStatefulComponent(instance, parentSuspense)
  }
  // 设置组件的渲染回调effect函数
  setupRenderEffect(
    instance,
    parentSuspense,
    initialVNode,
    container,
    anchor,
    isSVG
  )
}
```
接着上面分析下component.ts中setupStatefulComponent方法
``` js
export function setupStatefulComponent(
  instance: ComponentInternalInstance,
  parentSuspense: SuspenseBoundary | null
) {
  const Component = instance.type as ComponentOptions
  // 检查组件命名
  if (__DEV__) {
    if (Component.name) {
      validateComponentName(Component.name, instance.appContext.config)
    }
    if (Component.components) {
      const names = Object.keys(Component.components)
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        validateComponentName(name, instance.appContext.config)
      }
    }
  }
  // 创建render的代理，最终在mount之后就是返回的这个
  // PublicInstanceProxyHandlers位于componentProxy中，是构造整个组件内部实例的代理，其值绑定在内
  // 部实例的renderProxy属性上
  instance.renderProxy = new Proxy(instance, PublicInstanceProxyHandlers)
  // 2. 创建props的代理，setup函数第一个参数就是他
  const propsProxy = (instance.propsProxy = readonly(instance.props))
  // 这个setup就是组件里面的setup函数
  const { setup } = Component
  if (setup) {
    // setup函数接受一个以上参数的话，第二个参数就是其运行时候上下文，需要生成
    const setupContext = (instance.setupContext =
      setup.length > 1 ? createSetupContext(instance) : null)
    currentInstance = instance
    currentSuspense = parentSuspense
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      ErrorCodes.SETUP_FUNCTION,
      [propsProxy, setupContext]  //运行setup时候函数参数
    )
    currentInstance = null
    currentSuspense = null
    if (
      setupResult &&
      isFunction(setupResult.then) &&
      isFunction(setupResult.catch)
    ) {
      if (__FEATURE_SUSPENSE__) {
        // async setup returned Promise.
        // bail here and wait for re-entry.
        instance.asyncDep = setupResult
      } else if (__DEV__) {
        warn(
          `setup() returned a Promise, but the version of Vue you are using ` +
            `does not support it yet.`
        )
      }
      return
    } else {
      // 如果返回值是函数则绑定到实例的render上,如果是对象则reactive化并绑定到renderContext上
      // 之后还是触发finishComponentSetup方法
      handleSetupResult(instance, setupResult, parentSuspense)
    }
  } else {
    // 该方法主要构造组件实例的render方法（如果不存在的话）也会绑定到实例type.render上，使用的是
    // compile方法传入模版生成渲染函数(如果组件初始化时候有了render函数话就直接赋值给实例render函数)
    finishComponentSetup(instance, parentSuspense)
  }
}
// 构造整个组件内部实例的代理，其值绑定在内部实例的renderProxy属性上mount之后也是返回的该值
// 当运行编译后的render函数的时候，其传入的上下文就是renderProxy，此时在里面取值的话就会触发
// 此get方法, 从而取到值
export const PublicInstanceProxyHandlers: ProxyHandler<any> = {
  get(target: ComponentInternalInstance, key: string) {
    const { renderContext, data, props, propsProxy } = target
    // renderContext组件内部setup函数运行之后返回值的reactive化的返回值即reactive(setup())
    // 还有inject打入的值也绑定在renderContext上
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
```
最后触发setupRenderEffect方法
``` js
// 该方法运行数据响应系统effect方法定义并运行数据响应时候对应的回调函数，
function setupRenderEffect(
    instance: ComponentInternalInstance,
    parentSuspense: HostSuspenseBoundary | null,
    initialVNode: HostVNode,
    container: HostElement,
    anchor: HostNode | null,
    isSVG: boolean
  ) {
  // 创建reactive effect用来组件渲染并绑定到实例update上面
  let mounted = false
  instance.update = effect(function componentEffect() {
    if (!mounted) {
      // 使用component.ts中renderComponentRoot方法生成模版字符串
      //（实际上就是运行实例的render函数）并绑定到实例的subTree方法上
      // 此render函数运行时候会传入上下文，看代码可知是renderProxy,也就是整个组件内部实例的proxy
      const subTree = (instance.subTree = renderComponentRoot(instance))
      // beforeMount钩子
      if (instance.bm !== null) {
        invokeHooks(instance.bm)
      }
      //传入上面的subTree之后运行patch --> processElement --> mountElement该方法里面就是
      // 创建节点并插入节点绑定响应点击事件
      patch(null, subTree, container, anchor, instance, parentSuspense, isSVG)
      initialVNode.el = subTree.el
      // mounted钩子
      if (instance.m !== null) {
        queuePostRenderEffect(instance.m, parentSuspense)
      }
      mounted = true
    } else {
      // 组件更新时候触发
      // 组件内部状态改变时候触发此时(next: null),例如上面的点击事件触发时候会进入该方法
      // 或者父组件调用processComponent时候触发此时(next: HostVNode)
      const { next } = instance

      if (__DEV__) {
        pushWarningContext(next || instance.vnode)
      }

      if (next !== null) {
        // 更新实例的vnode和next置为null等
        updateComponentPreRender(instance, next)
      }
      const prevTree = instance.subTree
      // 重新运行render函数生成字符串
      const nextTree = (instance.subTree = renderComponentRoot(instance))
      // beforeUpdate钩子
      if (instance.bu !== null) {
        invokeHooks(instance.bu)
      }
      // reset refs
      // only needed if previous patch had refs
      if (instance.refs !== EMPTY_OBJ) {
        instance.refs = {}
      }
      // 这里触发更新载入, 我们的点击事件例子就会按这个流程触发载入
      // patch --> processElement --> patchElement --> hostSetElementText
      patch(
        prevTree,
        nextTree,
        // parent may have changed if it's in a portal
        hostParentNode(prevTree.el as HostNode) as HostElement,
        // anchor may have changed if it's in a fragment
        getNextHostNode(prevTree),
        instance,
        parentSuspense,
        isSVG
      )
      instance.vnode.el = nextTree.el
      if (next === null) {
        // hoc就是高阶组件，是一个function函数，可以看出它不会修改原来的组件，使用
        // return去返回一个组件然后再渲染被包装的组件
        // 高阶组件只接受数据props，不关心数据来源。等其他特点
        updateHOCHostEl(instance, nextTree.el)
      }
      // updated hook
      if (instance.u !== null) {
        queuePostRenderEffect(instance.u, parentSuspense)
      }

      if (__DEV__) {
        popWarningContext()
      }
    }
  }, __DEV__ ? createDevEffectOptions(instance) : prodEffectOptions)
}
```



## 计算属性、渲染函数、数据监听等流程
``` js
const { render, createComponent, h } = Vue;
const Comp = createComponent({
  data() {
    return {
      foo: 1
    }
  },
  extends: {
    data() {
      return {
        my: 1
      }
    }
  },
  watch: {
    foo: function(val, oldval) {
      console.log(val);
    }
  },
  computed: {
    bar() {
      return this.foo + 1
    },
    baz() {
      return this.bar + 1
    }
  },
  render() {
    return h(
      'div',
      {
        onClick: () => {
          this.foo++
          console.log(this.my)
        }
      },
      this.bar + this.baz
    )
  }
})
const vnode = h(Comp);
render(vnode, '#container');
```
h函数就是用来生成vnode的，render函数用来渲染，这里的方式和第一个流程一样，不同在component.ts中
finishComponentSetup中渲染函数是用组件里面的函数赋值的，不是compile编译出来，还有就是调用
apiOptions.ts中applyOptions方法来处理组件,在里面处理组件所有参数，可以看下该函数
``` js
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
  // 监听函数的使用过程，调用apiWatch.ts中watch方法，之后调用里面的doWatch
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
  // 需要inject的值提最终都绑定到renderContext上面
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

  // 生命周期函数
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
```
接下来我们看下dowatch方法，这个方法主要用来触发数据响应系统的依赖收集等
``` js
function doWatch(
  source: WatcherSource | WatcherSource[] | SimpleEffect,
  cb:
    | ((newValue: any, oldValue: any, onCleanup: CleanupRegistrator) => any)
    | null,
  { lazy, deep, flush, onTrack, onTrigger }: WatchOptions = EMPTY_OBJ
): StopHandle {
  const instance = currentInstance
  const suspense = currentSuspense
  let getter: () => any
  if (isArray(source)) {
    getter = () =>
      source.map(
        s =>
          isRef(s)
            ? s.value
            : callWithErrorHandling(s, instance, ErrorCodes.WATCH_GETTER)
      )
  } else if (isRef(source)) {
    getter = () => source.value
  } else if (cb) {
    // 运行此函数可以取到当前监听的键对应值
    getter = () =>
      callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER)
  } else {
    // no cb -> simple effect
    getter = () => {
      if (instance && instance.isUnmounted) {
        return
      }
      if (cleanup) {
        cleanup()
      }
      return callWithErrorHandling(
        source,
        instance,
        ErrorCodes.WATCH_CALLBACK,
        [registerCleanup]
      )
    }
  }

  if (deep) {
    const baseGetter = getter
    getter = () => traverse(baseGetter())
  }

  let cleanup: Function
  const registerCleanup: CleanupRegistrator = (fn: () => void) => {
    // TODO wrap the cleanup fn for error handling
    cleanup = runner.onStop = () => {
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP)
    }
  }
  let oldValue = isArray(source) ? [] : undefined
  // 定义响应的回调函数
  const applyCb = cb
    ? () => {
        if (instance && instance.isUnmounted) {
          return
        }
        const newValue = runner()
        if (deep || newValue !== oldValue) {
          // cleanup before running cb again
          if (cleanup) {
            cleanup()
          }
          callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
            newValue,
            oldValue,
            registerCleanup
          ])
          oldValue = newValue
        }
      }
    : void 0
  let scheduler: (job: () => any) => void
  if (flush === 'sync') {
    scheduler = invoke
  } else if (flush === 'pre') {
    scheduler = job => {
      if (!instance || instance.vnode.el != null) {
        queueJob(job)
      } else {
        // with 'pre' option, the first call must happen before
        // the component is mounted so it is called synchronously.
        job()
      }
    }
  } else {
    scheduler = job => {
      // createRenderer.ts中，该方法内部到scheduler.ts中queuePostFlushCb方法(把所有
      // 回调都写入postFlushCb数组)在里面使用nextTick以promise.then的形式触发
      // flushJobs-- > flushPostFlushCbs在该方法里面触发所有回调，这里的回调就是dowatch方法中的
      // applyCb变量，该回调的触发方式采用统一的方法callWithAsyncErrorHandling
      queuePostRenderEffect(job, suspense)
    }
  }
  const runner = effect(getter, {
    lazy: true,
    // so it runs before component update effects in pre flush mode
    computed: true,
    onTrack,
    onTrigger,
    scheduler: applyCb ? () => scheduler(applyCb) : scheduler
  })

  if (!lazy) {
    if (applyCb) {
      scheduler(applyCb)
    } else {
      scheduler(runner)
    }
  } else {
    oldValue = runner()
  }
  // 收集所有effect
  recordEffect(runner)
  return () => {
    stop(runner)
  }
}
```






