# vuex的实例方法解析

## commit、subscribe方法
commit方法是可以被订阅的，从而每次mutation改变状态之后触发该订阅函数，注意这是实例触发该方法store.commit形式，如果
在模块中使用，例如在actions中的参数commit使用的时候会自动加上命名空间之后再触发该函数,可以观察registerAction中的方
法，可以看到commit中传的是local.commit，可知是自己的上下文的commit
``` js
function genericSubscribe (fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}
// 可以先使用store.subscribe去订阅mution
// 分析可知运行其订阅后的返回值store.subscribe(fn)()可取消对应订阅
subscribe (fn) {
  return genericSubscribe(fn, this._subscribers)
}
commit (_type, _payload, _options) {
  // check object-style commit
  const {
    type,
    payload,
    options
  } = unifyObjectStyle(_type, _payload, _options)

  const mutation = { type, payload }
  // 取出对应mutation, 
  const entry = this._mutations[type]
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown mutation type: ${type}`)
    }
    return
  }
  // 执行对应函数
  this._withCommit(() => {
    entry.forEach(function commitIterator (handler) {
      handler(payload)
    })
  })
  // 触发_subscribers中的订阅方法
  // 第一个参数是对应mution,第二个参数是改变后的state
  this._subscribers
    .slice()
    .forEach(sub => sub(mutation, this.state))

  if (
    process.env.NODE_ENV !== 'production' &&
    options && options.silent
  ) {
    console.warn(
      `[vuex] mutation type: ${type}. Silent option has been removed. ` +
      'Use the filter functionality in the vue-devtools'
    )
  }
}
```

## dispatch、subscribeAction
subscribeAction 也可以指定订阅处理函数的被调用时机应该在一个 action 分发之前还是之后 (默认行为是之前)
其中dispath的触发方法也有两种和commit一样，看代码可知
``` js
/**
store.subscribeAction({
  before: (action, state) => {
    console.log(`before action ${action.type}`)
  },
  after: (action, state) => {
    console.log(`after action ${action.type}`)
  }
})
同理运行该函数返回值可解除该订阅
 **/
subscribeAction (fn) {
  const subs = typeof fn === 'function' ? { before: fn } : fn
  return genericSubscribe(subs, this._actionSubscribers)
}
dispatch (_type, _payload) {
  // check object-style dispatch
  const {
    type,
    payload
  } = unifyObjectStyle(_type, _payload)

  const action = { type, payload }
  const entry = this._actions[type]
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown action type: ${type}`)
    }
    return
  }
  // 改变前触发
  try {
    this._actionSubscribers
      .slice()
      .filter(sub => sub.before)
      .forEach(sub => sub.before(action, this.state))
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[vuex] error in before action subscribers: `)
      console.error(e)
    }
  }

  const result = entry.length > 1
    ? Promise.all(entry.map(handler => handler(payload)))
    : entry[0](payload)
  
  return result.then(res => {
    try {
      // 改变后触发
      this._actionSubscribers
        .filter(sub => sub.after)
        .forEach(sub => sub.after(action, this.state))
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[vuex] error in after action subscribers: `)
        console.error(e)
      }
    }
    return res
  })
}
```

## replaceState、watch、hotUpdate
和其他工具和模块配合使用的时候会使用的一些方法
``` js
// 替换 store 的根状态，仅用状态合并或时光旅行调试
// store.replaceState(state: Object)
replaceState (state) {
  this._withCommit(() => {
    this._vm._data.$$state = state
  })
}
//store.watch(fn: Function, callback: Function, options?: Object): Function
// 响应式地侦听 fn 的返回值，当值改变时调用回调函数。fn 接收 store 的 state 作为第一个参数，其 getter 作为第二
// 个参数。最后接收一个可选的对象参数表示 Vue 的 vm.$watch 方法的参数
// 要停止侦听，调用此方法返回的函数即可停止侦听
watch (getter, cb, options) {
  if (process.env.NODE_ENV !== 'production') {
    assert(typeof getter === 'function', `store.watch only accepts a function.`)
  }
  // 这里其实就是调用vue的$watch方法
  return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
}

// store.hotUpdate(newOptions: Object)
// 热替换新的 action 和 mutation
function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}
hotUpdate (newOptions) {
  this._modules.update(newOptions)
  resetStore(this, true)
}
```
例如当你想要使用热重载时候,使用 webpack 的 Hot Module Replacement API，Vuex 支持在开发过程中热重
载 mutation、module、action 和 getter。你也可以在 Browserify 中使用 browserify-hmr 插件
``` js
// store.js
import Vue from 'vue'
import Vuex from 'vuex'
import mutations from './mutations'
import moduleA from './modules/a'

Vue.use(Vuex)

const state = { ... }

const store = new Vuex.Store({
  state,
  mutations,
  modules: {
    a: moduleA
  }
})

if (module.hot) {
  // 使 action 和 mutation 成为可热重载模块
  module.hot.accept(['./mutations', './modules/a'], () => {
    // 获取更新后的模块
    // 因为 babel 6 的模块编译格式问题，这里需要加上 `.default`
    const newMutations = require('./mutations').default
    const newModuleA = require('./modules/a').default
    // 加载新模块
    store.hotUpdate({
      mutations: newMutations,
      modules: {
        a: newModuleA
      }
    })
  })
}
```

## registerModule、unregisterModule
模块的动态注册和卸载
``` js
registerModule (path, rawModule, options = {}) {
  if (typeof path === 'string') path = [path]

  if (process.env.NODE_ENV !== 'production') {
    assert(Array.isArray(path), `module path must be a string or an Array.`)
    assert(path.length > 0, 'cannot register the root module by using registerModule.')
  }
  // 由前面分析可知就是在其父对象的_children中添加这个模块
  this._modules.register(path, rawModule)
  // 重新装载模块，注意options.preserveState参数，可决定是否需要保留state
  installModule(this, this.state, path, this._modules.get(path), options.preserveState)
  // reset store to update getters...
  resetStoreVM(this, this.state)
}

unregisterModule (path) {
  if (typeof path === 'string') path = [path]

  if (process.env.NODE_ENV !== 'production') {
    assert(Array.isArray(path), `module path must be a string or an Array.`)
  }

  this._modules.unregister(path)
  this._withCommit(() => {
    // 获取父state
    const parentState = getNestedState(this.state, path.slice(0, -1))
    // 删除对应键值模块
    Vue.delete(parentState, path[path.length - 1])
  })
  resetStore(this)
}
```














