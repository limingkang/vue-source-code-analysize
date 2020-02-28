# 初始化代码分析

## Vue.use(Vuex)
分析代码可知最终导出的对象中有个install键，其值就是mixin.js中的方法，需要运行该方法
``` js
const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    //因为2版本才提供了beforeCreate这个钩子函数
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }
  function vuexInit () {
    const options = this.$options
    // store注入，并挂载到$store
    if (options.store) {
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      // parent参数指定已创建的实例之父实例，在两者之间建立父子关系。子实例可以用 this.$parent 访问父
      // 实例，子实例被推入父实例的 $children 数组中
      this.$store = options.parent.$store
    }
  }
```

## store初始化
使用`store = new Vuex.Store({})`初始化store，可以看下store.js中的constructor
``` js
constructor (options = {}) {
  // 这个是在开发过程中的一些环节判断，vuex要求在创建vuex store实例之前必须先使用这个方法Vue.use(Vuex)来安
  // 装vuex，项目必须也得支持promise，store也必须通过new来创建实例
  if (process.env.NODE_ENV !== 'production') {
    assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
    assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in.`)
    assert(this instanceof Store, `Store must be called with the new operator.`)
  }
  
  // 从参数options中结构出相关变量
  const {
    plugins = [],
    strict = false
  } = options

  // 初始化store内部状态，Object.create(null)可以创建一个干净的空对象
  // 提交状态的标志，在_withCommit中，当使用mutation时，会先赋值为true，再执行mutation，修
  // 改state后再赋值为false，在这个过程中，会用watch监听state的变化时是否_committing为true，从
  // 而保证只能通过mutation来修改state
  this._committing = false
  // 这里面的函数运行都是返回的promise
  this._actions = Object.create(null)
  this._actionSubscribers = []
  // 保存所有的mutions，格式如
  /**
    moduleA/key1:[function(){}],
    moduleA/key2:[function(){}],
    moduleB/key1:[function(){}],
  **/
  this._mutations = Object.create(null)
  //用于保存包装后的getter
  this._wrappedGetters = Object.create(null)
  // vuex支持模块，即将state通过key-value的形式拆分为多个模块
  this._modules = new ModuleCollection(options)
  //// 用于保存namespaced的模块
  this._modulesNamespaceMap = Object.create(null)
  //// 用于监听mutation
  this._subscribers = []
  //// 用于响应式地监测一个 getter 方法的返回值
  this._watcherVM = new Vue()
  this._makeLocalGettersCache = Object.create(null)

  // bind commit and dispatch to self
  const store = this
  // 缓存dispatch和commit方法
  const { dispatch, commit } = this
  // 定义dispatch方法
  this.dispatch = function boundDispatch (type, payload) {
    return dispatch.call(store, type, payload)
  }
  // 定义commit方法
  this.commit = function boundCommit (type, payload, options) {
    return commit.call(store, type, payload, options)
  }
  // 定义严格模式，不要在发布环境下启用严格模式！严格模式会深度监测状态树来检测不合规的状态变更
  // 请确保在发布环境下关闭严格模式，以避免性能损失,具体后续enableStrictMode方法会提到
  this.strict = strict
  const state = this._modules.root.state
  // 初始化根模块，递归注册子模块，收集getter
  installModule(this, state, [], this._modules.root)
  //初始化store中的state,使得state变成响应式的，原理就是将state作为一个vue实例的data属性传入
  resetStoreVM(this, state)
  // 执行插件，这个是一个数组，所以遍历他，然后执行每个插件的函数
  plugins.forEach(plugin => plugin(this))
  // 调试工具使用，实现时光回退等功能
  const useDevtools = options.devtools !== undefined ? 
        options.devtools : Vue.config.devtools
  if (useDevtools) {
    devtoolPlugin(this)
  }
}
```
接下来我们看下核心的模块安装的方法`installModule(this, state, [], this._modules.root)`
``` js
function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length
  const namespace = store._modules.getNamespace(path)
  /*
   * {
   *   // ...
   *   modules: {
   *     moduleA: {
   *       namespaced: true
   *     },
   *     moduleB: {}
   *   }
   * }
   * moduleA的namespace -> 'moduleA/'
   * moduleB的namespace -> ''
   */
  if (module.namespaced) {
    // 保存namespaced模块
    store._modulesNamespaceMap[namespace] = module
  }

  // 非根组件设置state
  if (!isRoot && !hot) {
    // 根据path获取父state
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      // 使用Vue.set将state设置为响应式
      Vue.set(parentState, moduleName, module.state)
    })
  }
  // 设置module的上下文，从而保证mutation和action的第一个参数能拿到对应的state getter等
  // make localized dispatch, commit, getters and state
  // if there is no namespace, just use root ones
  const local = module.context = makeLocalContext(store, namespace, path)
  // 逐一注册mutation
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    // 保存到全局_mutations
    registerMutation(store, namespacedType, mutation, local)
  })
  // 逐一注册action, 保存到全局的store的_actions上面，格式和mutions一样
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    // 该方法如果会对相应函数的返回值做promise处理
    registerAction(store, type, handler, local)
  })
  // 逐一注册getter，保存到store的_wrappedGetters上面格式如
  /**
    moduleA/key1:function wrappedGetter(store){},
    moduleA/key2:function wrappedGetter(store){},
    moduleB/key1:function wrappedGetter(store){},
  **/
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })
  // 逐一注册子module
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

// 可以简单看下registerAction方法
function registerAction (store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)
    // 对返回值如果不是promise则用promise包裹
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}
```
上面的分析中有个makeLocalContext方法来设置module的上下文，绑定对应的dispatch、commit、getters、state
``` js
function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === ''
  const local = {
    // 如果没有namespace，直接使用原来的
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      // 统一格式 因为支持payload风格和对象风格
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args
      // 如果参数传了{root: true}不会加上namespace 即在命名空间模块里提交根的 action
      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },
    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }
      // 触发mutation
      store.commit(type, payload, options)
    }
  }
  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // 这里的getters和state需要延迟处理，需要等数据更新后才进行计算，所
  // 以使用getter函数，当访问的时候再进行一次计算
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}
```
初始化store中的state,使得state变成响应式的，原理就是将state作为一个vue实例的data属性传入
``` js
function resetStoreVM (store, state, hot) {
  // 保存原有store的_vm
  const oldVm = store._vm
  // bind store public getters
  store.getters = {}
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null)
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  // 遍历这个对象，获取每个getter的key和对应的方法
  forEachValue(wrappedGetters, (fn, key) => {
    computed[key] = partial(fn, store)
    // 将getter以key-value的形式缓存在变量computed中，其实后面就是将getter作为vue实例中的计算属性
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })
  // silent设置为true，则取消了所有的警告和日志，眼不见为净
  const silent = Vue.config.silent
  Vue.config.silent = true
  // 将传入的state，作为vue实例中的data的$$state属性，将刚刚使用computed变量搜集的getter，作为
  // 实例的计算属性，所以当state和getter都变成了响应式的了
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  //如果设置了严格模式则，不允许用户在使用mutation以外的方式去修改state
  if (store.strict) {
    // 就是通过$watch去深度监听state的值
    enableStrictMode(store)
  }

  if (oldVm) {
    if (hot) {
      // 将原有的vm中的state设置为空，所以原有的getter都会重新计算一遍，利用的就是vue中的响应式，getter作
      // 为computed属性，只有他的依赖改变了，才会重新计算，而现在把state设置为null，所以计算属性重新计算
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    // 在下一次周期销毁实例
    Vue.nextTick(() => oldVm.$destroy())
  }
}
```











