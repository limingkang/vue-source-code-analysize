## 生成 beforeRouteEnter 守卫
上文说到，当异步路由（组件）全部解析完毕后，会执行 next 方法遍历 queue 数组中的下个元素，但此时 queue 数组中
的元素已经全部遍历完毕，所以会直接执行 runQueue 的第三个参数，即成功的回调函数
``` js
// 等到队列中所有的组件（懒加载的组件）都解析完毕后，就会执行第三个参数回调
// 即为什么beforeRouteEnter钩子需要在next回调中执行的原因
runQueue(queue, iterator, /*队列遍历结束后，执行异步组件的回调（此时懒加载组件以及被解析完毕）*/() => {
  const postEnterCbs = [] // 保存beforeRouterEnter的next回调
  const isValid = () => this.current === route
    //返回当前组件的 beforeRouteEnter 钩子函数（数组）
  const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
    //将 beforeResolve 钩子放到 beforeRouteEnter 钩子数组的后面依次执行
  const queue = enterGuards.concat(this.router.resolveHooks)
    // 遍历队列执行 beforeRouteEnter 和 beforeResolve 钩子
  runQueue(queue, iterator, () => {
    if (this.pending !== route) {
      return abort()
    }
    this.pending = null
    // 确认导航，执行onComplete回调，包含：
    // $nextTick 后更新视图
    // 执行afterEach钩子（74）
    onComplete(route)
    if (this.router.app) {
      /**在nextTick后执行 postEnterCbs 数组即 beforeRouteEnter 的next方法的参数（函数）**/
      /**因为此时 nextTick 队列中存在一个 render watcher 所以先执行 render watcher 更新视图，再执行 beforeRouteEnter 的回调**/
      // 最终
      // 因此 beforeRouteEnter 需要通过回调传入this的值
      this.router.app.$nextTick(() => {
        postEnterCbs.forEach(cb => { cb() })
      })
    }
  })
})
```
紧接着会执行 extractEnterGuards 这个函数，而上文中介绍到 extract 开头的函数会根据传入的路由记录这个参数，从中获
取组件配置项中的指定的路由守卫，这里 vue-router 会根据 activated 数组，也就是跳转前后新增的路由记录数组，从中获
取 beforeRouteEnter 守卫，和之前的那些路由守卫不同的是，它会额外传入一个 postEnterCbs 参数来存
储beforeRouteEnter 守卫中，通过 next 方法传入的回调参数

`beforeRouteEnter(to, from, next){next((vm)=>{})}`

如果在组件中 beforeRouteEnter 守卫里的 next 函数里，传入了一个回调函数，就会往 postEnterCbs 数组中添加这
个回调，同时回调会被包裹一层 poll 函数用来指定参数，即组件实例 vm
``` js
function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(activated, 'beforeRouteEnter', (guard, _, match, key) => {
    return bindEnterGuard(guard, match, key, cbs, isValid)
  })
}
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    // 将用户定义在beforeRouteEnter中的next函数，作为第三个参数传入guard中
    return guard(to, from, /*cb是一个函数，作为回调函数的参数*/cb => {
      next(cb)
      /**当cb是一个函数，即next中传入了一个回调函数时，会将它放到回调数组中，在nextTick后执行它
       * 因为这个时候组件虽然被解析成功了，但是触发视图更新的逻辑还未执行（没有给route赋值），所以回调需要在nextTick后才能拿到vm实例
       * **/
      if (typeof cb === 'function') {
        cbs.push(() => {
          // 如果存在特殊情况（transition） 会延迟到下个宏任务执行，一般不会
          poll(cb, match.instances, key, isValid)
        })
      }
    })
  }
}
function poll (
  cb: any, 
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed 
  ) {
    // 只有当组件被生成后，执行registerRouteInstance给matched对象赋值了当前组件的实例，instances[key]才会获得组件实例
    // 调用cb并且传入vm实例，所以在next的参数cb中中可以拿到参数vm
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
```

## 确认导航和页面更新
当导航被解析完成之后，开始走确认导航的逻辑
``` js
this.confirmTransition(route, () => {
  this.updateRoute(route) //确认导航成功，更新视图以及执行afterEach钩子

  // 执行transitionTo成功的回调(src/index.js:116)
  // 就是init方法初始化的时候的传入函数值为：
  // const setupHashListener = () => {
  //   history.setupListeners()
  // }
  onComplete && onComplete(route)
  //随后会执行 ensureURL 方法，使用 pushState 或者 location.hash 的形式设置 url
  this.ensureURL()

  // fire ready cbs once
  if (!this.ready) {
    this.ready = true
    this.readyCbs.forEach(cb => { cb(route) })
  }
}, err => {
  if (onAbort) {
    onAbort(err)
  }
  if (err && !this.ready) {
    this.ready = true
    this.readyErrorCbs.forEach(cb => { cb(err) })
  }
})
// 确认导航成功，执行afterEach钩子
updateRoute (route: Route) {
  const prev = this.current
  this.current = route
  /** 执行回调给route赋值，随即触发视图更新（src/index.js:125）
   * 此时的 current 已经不在是跳转前的 $route 对象了，更新成跳转后的 $route 对象
   * 接着会执行 cb 方法，cb 方法定义在 vue-router 类中
   * 
   * 当 vue-router 初始化的时候会执行 history.listen 并传入一个回调，而这个回调最终会
   * 成为 history 实例的 cb 方法，当执行这个回调时，就可以实现页面之间的切换
  */
  this.cb && this.cb(route)
  //视图的更新就被 Vue 延迟到 nextTick 后执行，先会在 updateRoute 中遍历 afterHooks 执行 afterEach 守卫
  this.router.afterHooks.forEach(hook => {
    hook && hook(route, prev)
  })
}
// 在执行完 afterEach 后，文档的下一步是触发 DOM 更新也就是视图的更新，但其实 vue-router 还会做一些别的
// 逻辑，例如给 hash 模式下的路由设置监听事件，监听浏览器的前进后退，以及一些滚动事件
// 在 updateRoute 方法执行后会执行 transitionTo 方法的成功回调，hash 模式最终会
// 执行 setupListeners 设置监听事件
setupListeners () {
  const router = this.router
  const expectScroll = router.options.scrollBehavior
  const supportsScroll = supportsPushState && expectScroll

  if (supportsScroll) {
    setupScroll()
  }

  /**哈希路由在初始化的时候，执行完transitionTo，会给浏览器监听前进和后退的事件**/
  window.addEventListener(supportsPushState ? 'popstate' : 'hashchange', () => {
    const current = this.current
    if (!ensureSlash()) {
      return
    }
    //当点击浏览器前进/后退后，会重新执行 transitionTo 方法
    this.transitionTo(getHash(), route => {
      if (supportsScroll) {
        handleScroll(this.router, route, current, true)
      }
      if (!supportsPushState) {
        replaceHash(route.fullPath)
      }
    })
  })
}
```

## 注册页面更新的回调
上面说到当 vue-router 初始化的时候会执行 history.listen 并传入一个回调，而这个回调最终会成为 history 实
例的 cb 方法，当执行这个回调时，就可以实现页面之间的切换
``` js
history.listen(route => {
  // this.apps 我们第一章分析过，是一个保存根 Vue 实例的数组，最终会将根实例的 _route 属性更
  // 新为当前的 $route 对象，就是这样短短一行代码就可以实现整个页面的切换
  this.apps.forEach((app) => {
    app._route = route
  })
})
```
在第一章混入全局钩子那节,就是里面的install函数中vue-router 会调用 Vue 核心库中的 defineReactive 将根实
例的 _route 属性变成响应式， 另外还通过 Object.defineProperty 定义了 $route 属性指向 _route，结合Vue的
响应式原理，也就是说当 $route 被修改后，通过 defineReactive 会通知所有依赖 $route 的 watcher

而只有 render watcher 才有改变视图的功能，所以可以推测出在某个组件的 render 函数中依赖
到了 $route，而这个组件就是 vue-router 内置的全局视图组件 router-view

``` js
render (_, { props, children, parent, data }) {
  // used by devtools to display a router-view badge
  data.routerView = true

  // directly use parent context's createElement() function
  // so that components rendered by router-view can resolve named slots
  const h = parent.$createElement
    // name为命名视图的 name 默认为 default
  const name = props.name
  /**
   * 由于 _route 在 vue-router 初始化时变成了一个响应式对象
   * 所以会触发 _route 的 getter，收集当前的渲染 watcher（src/install.js:40）
   * 当 /src/index.js:126 路由跳转后，会触发其 setter，重新运行 render 函数更新视图
   */
  // 因为此时是 parent 组件，所以 Dep.target 为 parent 组件的渲染 watcher
  const route = parent.$route
  const cache = parent._routerViewCache || (parent._routerViewCache = {})

  // determine current view depth, also check to see if the tree
  // has been toggled inactive but kept-alive.
  let depth = 0
  let inactive = false
  while (parent && parent._routerRoot !== parent) {
    // depth 表示router-view的深度，当当前router-view的parent又是一个router-view时，当前的router-view深度就会+1
    // 默认是0，当发生了router-view的嵌套关系时，里层的router-view的depth为1
    // 根据 routes 配置项中的嵌套关系，来渲染对应的视图
    if (parent.$vnode && parent.$vnode.data.routerView) {
      depth++
    }
    if (parent._inactive) {
      inactive = true
    }
    parent = parent.$parent
  }
  data.routerViewDepth = depth

  // render previous view if the tree is inactive and kept-alive
  if (inactive) {
    return h(cache[name], data, children)
  }

  // matched来自当前route的matched属性
  // matched是一个数组，顺序由父 => 子（src/util/route.js:32），根据深度来返回对应的路由记录
  const matched = route.matched[depth]
  // render empty node if no matched route
  if (!matched) {
    cache[name] = null
    return h()
  }

  const component = cache[name] = matched.components[name]

  // attach instance registration hook
  // this will be called in the instance's injected lifecycle hooks
  // 将组件的instances属性等于 val 参数(src/install.js:37)
  // 在执行 registerRouteInstance 时，已经可以获取到 vm 实例（因为是在组件的 beforeCreate 中被执行的，而此时已经生成了 vm 实例）
  data.registerRouteInstance = (vm, val) => {
    // val could be undefined for unregistration
    const current = matched.instances[name]
    if (
      (val && current !== vm) ||
      (!val && current === vm)
    ) {
      matched.instances[name] = val
    }
  }

  // also register instance in prepatch hook
  // in case the same component instance is reused across different routes
  ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
    matched.instances[name] = vnode.componentInstance
  }

  // resolve props
    // 解析路由的参数并给组件通过 props 传参（在路由记录中会存在 props 属性）
  let propsToPass = data.props = resolveProps(route, matched.props && matched.props[name])
  if (propsToPass) {
    // clone to prevent mutation
    propsToPass = data.props = extend({}, propsToPass)
    // pass non-declared props as attrs
    const attrs = data.attrs = data.attrs || {}
    for (const key in propsToPass) {
      if (!component.props || !(key in component.props)) {
        attrs[key] = propsToPass[key]
        delete propsToPass[key]
      }
    }
  }

  return h(component, data, children)
}
```
router-view 内部会通过 render 函数根据 $route 中的 components 属性也就是组件配置项，生成 vnode 最后交给 Vue
渲染出视图，所以就会依赖到 $route在确认导航的 updateRoute 方法中，执行 cb 就会触发视图的改变，但是这个行为不会立即被触发，即
视图并不会立即被改变,视图是在 nextTick 后异步更新的，原因在于只有这样所有的 watcher 才能获取到最终的数据

Vue 会维护一个队列，保存所有 watcher，当 cb 执行后为了更新视图，会将 router-view 的 render watcher 推入这个队
列，在推入的过程中会进行唯一值的判断，使得同一个 watcher 在队列中只存在一个，并在 nextTick 后再执行所有的watcher回
调，这个时候才会改变视图


## 执行 beforeRouteEnter 守卫中的回调
前面介绍 beforeRouterEnter 时提到，vue-router 会将 next 方法中的回调推入 postEnterCbs 数组中，当
confirmTransition 的成功回调执行完毕后，会把 postEnterCbs 数组放到 nextTick 后执行
``` js
if (this.router.app) {
  /**在nextTick后执行 postEnterCbs 数组即 beforeRouteEnter 的next方法的参数（函数）**/
  /**因为此时 nextTick 队列中存在一个 render watcher 所以先执行 render watcher 更新视图，再执行 beforeRouteEnter 的回调**/
  // 最终
  // 因此 beforeRouteEnter 需要通过回调传入this的值
  this.router.app.$nextTick(() => {
    postEnterCbs.forEach(cb => { cb() })
  })
}
```
- 前面还提到，当在更新视图的时候，Vue 会将视图更新的 render watcher 也放在 nextTick 后执行，也就是说
当 postEnterCbs 数组被执行前，会先执行视图更新的逻辑

- 这就是为什么只有 beforeRouteEnter 守卫获得组件实例时，需要定义一个回调并传入 next 函数中的原因，因为
守卫执行的时候是同步的，但是只有在 nextTick 后才能获得组件实例， vue-router 通过回调的形式，将回调
的触发时机放到视图更新之后，这样就能保证能够获得组件实例


### 回调函数
之前还留下一个问题是，在注册回调时，会给回调传入组件实例，也就是路由记录中 instance[key]， 而在注册时它却是一个空对象
答案显而易见，还是因为这个时候组件并没有生成，所以不会有组件实例，但是当组件生成后我们需要将 instance[key] 赋值为当前组件
回到最初安装 vue-router 的时候，vue-router 会全局混入 beforeCreate 和 destroyed 2个钩子中registerInstance函数

而这个 registerInstance 的作用正是当组件被生成时，给路由记录的 instance 属性添加当前视图的组件实例
（ registerInstance 一定会在 next 的回调执行前执行，因为组件更新顺序在 next 的回调之前，而 beforeCreate 是
组件更新时执行的逻辑）

``` js
// 注册组件实例（src/components/view.js:65）
// 当组件被初始化后进入 beforeCreate 钩子时，才会有组件实例，这时候才会执行 registerInstance
const registerInstance = (vm, callVal) => {
  // i为 router-view 组件占位符 vnode
  // 这里会执行 registerRouteInstance，将当前组件实例赋值给匹配到的路由记录（用于beforeRouteEnter的回调获取vm实例）
  let i = vm.$options._parentVnode
  if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
    i(vm, callVal)
  }
}
// 在route-view中将组件的instances属性等于 val 参数(src/install.js:37)
// 在执行 registerRouteInstance 时，已经可以获取到 vm 实例（因为是在组件的 beforeCreate 中被执行的，而此时已经生成了 vm 实例）
data.registerRouteInstance = (vm, val) => {
  // val could be undefined for unregistration
  const current = matched.instances[name]
  if (
    (val && current !== vm) ||
    (!val && current === vm)
  ) {
    matched.instances[name] = val
  }
}
```
最终在 router-view 组件中调用 matched.instances[name] = val 进行赋值，这样在执行 next 的回调中就可以获取到组件实例


