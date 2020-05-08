## $route对象生成的时机
由以前的分析可以知道，我们在钩子中会使用init 方法会初始化整个 vue-router ，而实例化和初始化 vue-router 是有区
别的，实例化指的是通过 new Router 生成 vue-router 实例，初始化可以理解为进行全局第一次的路由跳转时，
让vue-router 实例和组件建立联系，使得路由能够接管组件


接下来我们来看 vue-router 是如何初始化的
``` js
// 初始化router实例
init (app: any /* Vue component instance */) {
  // app为在router对象初始化时执行init方法的参数（根实例），将根实例添加到apps数组中（用于多次执行VueRouter创建多个实例，比较少用）
  this.apps.push(app)
  // 保证app属性只有唯一一个
  if (this.app) {
    return
  }
  this.app = app
  const history = this.history
  // transitionTo这个方法，它是整个路由跳转的核心方法
  if (history instanceof HTML5History) {
    history.transitionTo(history.getCurrentLocation())
  } else if (history instanceof HashHistory) {
    const setupHashListener = () => {
      history.setupListeners()
    }
    history.transitionTo(
      history.getCurrentLocation(),// 例如获取hash值后面的路径
      setupHashListener, //成功回调(给哈希路由的模式监听浏览器的popState和hashchange)
      setupHashListener //取消回调
    )
  }
  // 注册回调，当history发生改变后会执行回调（src/history/base.js:221）
  // 即修改_route属性，因为_route属性是一个视图依赖的响应式变量，所以会触发视图的重新渲染
  // 至于触发 _route 的 setter 为什么会更新视图，请参考 router-view 组件
  history.listen(route => {
    this.apps.forEach((app) => {
      app._route = route
    })
  })
}
```
由上面的分析可以知道，transitionTo是路由跳转的核心方法
``` js
/**vue-router路由跳转的核心逻辑
 * 执行所有的路由钩子
 * 解析异步路由组件
 * **/
transitionTo (/*跳转的路由信息*/location: RawLocation,/*成功回调*/ onComplete?: Function, onAbort?: Function) {
  // this是history路由实例（HashHistory | HTML5History）
  // this.router是vueRouter实例
  // match方法会根据当前的location + 之前生成的路由映射表（nameMap,pathMap），生成$route对象（src/create-matcher.js:31）
  // current是切换前的$route对象
  // 这个match方法就会创建出一个$route对象，随后会进入confirmTransition这个方法，负责控制所有的路由守卫的执行
  const route = this.router.match(location, this.current)
  // transitionTo的核心，执行一系列路由钩子
  // 传入route对象，成功回调和失败回调
  this.confirmTransition(route, () => {
    this.updateRoute(route) //确认导航成功，更新视图以及执行afterEach钩子

    // 执行transitionTo成功的回调(src/index.js:116)
    onComplete && onComplete(route)
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
}
```
使用以前的例子，当我们直接在浏览器的 url 中输入http://localhost:8080/#/comp1/comp1Child 时，可以观察到
location 参数为跳转目标的路径，并且此时是全局第一次调用 transitionTo 方法，vue-router 默认第一次跳转的current
参数为根路径的 $route 对象，而以后的跳转，current 会变成当前路由的 $route 对象
``` js
// 第一次 history.current 值为根路径转换而来的 $route 对象
constructor (router: Router, base: ?string) {
  this.current = START
}
export const START = createRoute(null, {
  path: '/'
})
```

## 路由守卫的原理
和组件的生命周期的钩子不同，路由守卫将重点放在路由上，能够控制路由跳转，一般用在页面级别的路由跳转时控制跳转的逻辑，比
如在路由守卫中检查用户是否有进入当前页面的权限，没有则跳转到授权页面，亦或是在离开页面时警告用户有未确认的信息，确认后
才能跳转等等

在路由守卫中，一般会接收3个参数，to，from，next，前两个分别是跳转后和跳转前页面路由的 $route 对象，第
三个参数 next 是一个函数，当执行 next 函数后会进行跳转，如果一个包含 next 参数的路由守卫里没有执行该函数，页面会无
法跳转，接下来我们来解密路由守卫背后的原理
``` js
// transitionTo的核心，执行一系列路由钩子
// 传入route对象，成功回调和失败回调
confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
  const current = this.current //切换前的route对象
  const abort = err => {
    if (isError(err)) {
      if (this.errorCbs.length) {
        this.errorCbs.forEach(cb => { cb(err) })
      } else {
        warn(false, 'uncaught error during route navigation:')
        console.error(err)
      }
    }
    onAbort && onAbort(err)
  }
  if (
    isSameRoute(route, current) &&
    // in the case the route map has been dynamically appended to
    route.matched.length === current.matched.length
  ) {
    this.ensureURL()
      // 相同路径则取消路由跳转
    return abort()
  }

  /**计算出当前路由和跳转路由在路径上的相同点不同点（路由记录），来执行不同的导航守卫
   * 这个函数的作用是根据跳转前和跳转后 $route 对象的 matched 数组，返回这2个数组包含的路由记录的区别
   * $route 对象的 matched 属性是一个数组，通过 formatMatch 函数最终返回 $route 对象以及所有父级的路由记录
   * 返回3个数组，updated 代表跳转前后 matched 数组相同部分，deactivated 代表删除部分，activated 代表新增部分
   * 
   * 举个例子，当我们从 comp1Child 页面跳转到 comp2 页面，这3个数组分别对应的值
   * 跳转前[{comp1Record}, {comp1ChildRecord}]
   * 跳转后[{comp2Record}]
   * 
   * 相同部分: []
   * 新增部分:[{comp2Record}]
   * 删除部分:[{comp1Record}, {comp1ChildRecord}]
  */
  const {
    updated,
    deactivated,
    activated
    // this.current指的是当前路由，route是跳转路由
  } = resolveQueue(this.current.matched, route.matched)

  // queue是NavigationGuard组成的数组， NavigationGuard是路由守卫的函数，传入to,from,next3个参数
  // 经过 queue 数组内部这些函数的转换最终会返回路由守卫组成的数组，而这些函数就是将上节中的路由记录转换为路由守卫的函数
  // 同时数组中的守卫的排列顺序也是设计好的,对应开发文档中的顺序
  // https://router.vuejs.org/zh/guide/advanced/navigation-guards.html#%E7%BB%84%E4%BB%B6%E5%86%85%E7%9A%84%E5%AE%88%E5%8D%AB
  const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
    extractLeaveGuards(deactivated), //返回离开组件的 beforeRouteLeave 钩子函数（数组，子 => 父）
    // global before hooks
    this.router.beforeHooks, //返回路由实例（全局）的 beforeEach 钩子函数（数组） （src/index.js:128）
    // in-component update hooks
    extractUpdateHooks(updated), //返回当前组件的 beforeRouteUpdate 钩子函数（数组，父 => 子）,
    // in-config enter guards
    activated.map(m => m.beforeEnter), //返回当前组件的 beforeEnter 钩子函数（数组）,
    // async components
    resolveAsyncComponents(activated)  // 解析异步组件(同样会返回一个导航守卫函数的签名，但是用不到 to,from 这 2 个参数)
  )

  this.pending = route

  //runQueue每次遍历都会执行iterator函数并且传入当前的路由守卫函数进行解析，解析后会执行next回调（即step+1）
  const iterator = (hook: NavigationGuard, next) => {
    if (this.pending !== route) {
      return abort()
    }
    try {
      //执行某个生命周期中的导航守卫
      hook(route, current, /*iterator next*/(to: any) => {
        if (to === false || isError(to)) {
          // next(false) -> abort navigation, ensure current URL
            // 如果传入的是next(false)会中断导航，并且会重置到form的路由
          this.ensureURL(true)
          abort(to)
        } else if ( //跳转到指定路由
          typeof to === 'string' ||
          (typeof to === 'object' && (
            typeof to.path === 'string' ||
            typeof to.name === 'string'
          ))
        ) {
          // next('/') or next({ path: '/' }) -> redirect
          abort() //取消导航并且执行push/replace跳转到指定路由
          if (typeof to === 'object' && to.replace) {
            this.replace(to)
          } else {
            this.push(to)
          }
        } else {
          // confirm transition and pass on the value
          // 如果next没有参数则直接执行runQueue next
          // 即解析queue的下个元素
          next(to)
        }
      })
    } catch (e) {
      abort(e)
    }
  }

  // 等到队列中所有的组件（懒加载的组件）都解析完毕后，就会执行第三个参数回调
  // 即为什么beforeRouteEnter钩子需要在next回调中执行的原因
  runQueue(queue, iterator, /*队列遍历结束后，执行异步组件的回调（此时懒加载组件以及被解析完毕）*/() => {
    const postEnterCbs = [] // 保存beforeRouterEnter的next回调
    const isValid = () => this.current === route
    // wait until async components are resolved before
    // extracting in-component enter guards
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
        // 因此 beforeRouteEnter 需要通过回调传入this的值
        this.router.app.$nextTick(() => {
          postEnterCbs.forEach(cb => { cb() })
        })
      }
    })
  })
}
```
我们先分析 queue 数组里第一个执行的函数 extractLeaveGuards，经过一层封装最终会执行通用函数 extractGuards
``` js
// 此时 records 参数为删除的路由记录，name 为 beforeRouteLeave，即最终触发的是 beforeRouteLeave 守卫
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}
// 根据records数组，返回当前这个组件对应的某个生命周期的路由守卫（数组）
function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  // 扁平化 + 数组Map
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    // 通过name（路由守卫的名字），获取到当前组件对应的路由守卫函数
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
          // 绑定上下文this，传入当前路由守卫函数，实例，record和视图名字
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  // 倒序数组，之前是父=>子，如果reverse为true则为子 => 父
  // 对于离开某个路由时，由于子路由需要先离开所以要倒序数组，让子组件先触发beforeLeave钩子
  return flatten(reverse ? guards.reverse() : guards)
}

// 扁平化后执行fn作为返回值
function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  // 数组扁平化
  return flatten(matched.map(m => {
    // 遍历components属性（一般为component，vue-router会把component变成components，因为有命名视图的可能）
    // 如果是component衍变的key为default，否则为自己定义的key值
    return Object.keys(m.components).map(key => fn(
        m.components[key], // 组件(key一般为default)，当是路由懒加载时这个值为函数（()=> import(.....)）
        m.instances[key], // 实例(实例默认为空对象，在registerInstance时，会在router-view中创建组件实例) （src/components/view.js:58）
        m, //路由记录
        key //视图名（一般为default）即使用默认组件
    ))
  }))
}
//def 为组件配置项，通过 Vue 核心库的函数 extend 将配置项转为组件构造器（虽然配置项中就能拿到对应的路由守卫，但是从
//官方注释发现只有转为构造器后才能拿到一些全局混入的钩子），在生成构造器时，Vue 会将配置项赋值给构造器的静态属
//性options最后返回配置项中对应的路由守卫函数，即如果我们在跳转后的组件中定义了 beforeRouteLeave 的话这里就会返回这个函数
function extractGuard (
  def: Object | Function,
  key: string //路由钩子的name
): NavigationGuard | Array<NavigationGuard> {
  // 非懒加载
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
      /**将配置项变成组件构造器**/
    def = _Vue.extend(def)
  }
  return def.options[key] //返回组件构造器options配置项中对应的路由钩子函数
}
```

## 路由懒加载的原理
通俗来说就是使用路由懒加载返回的路由，我们可以使用 import () 这种语法去动态的加载 JS 文件，放到 vue-router 中，就
可以实现异步加载组件配置项（这里只讨论开发中使用较多的 import() 语法）, 上面执行路由守卫最后一段queue就是异步组件
`component:()=>import('./components/comp1')`
``` js
//解析异步路由（传入当前新增的路由记录）
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, /*解析matched中的异步组件*/(def, _, match, key) => {
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true
        pending++

        /**以下代码会等到异步组件获取到后，在微任务队列中执行**/
        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef) // 这个组件构造器不知道哪里使用的。。。。
            // 将解析后的组件配置项赋值给路由中components属性（将组件配置项覆盖原来的()=>import(.....)）
          match.components[key] = resolvedDef
          pending--
          if (pending <= 0) {
            // 当匹配到的route中的 matched属性里记录的路由组件都被解析成功后，执行iterator next ，在 runQueue 中解析 queue 的下个元素
            // iterator next（src/history/base.js:154）
            next()
          }
        })

        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg)
            // 发生错误时，执行iterator next，最终会中断导航
            next(error)
          }
        })

        let res
        try {
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    if (!hasAsync) next()
  }
}
```
- resolveAsyncComponents 函数最终会返回一个函数，并且符合路由守卫的函数签名（这里 vue-router 可能只是为
了保证返回函数的一致性，实质上在这个函数中，并不会用到 to,from 这2个参数）
- 这个函数只是被定义了，并没有执行，但是我们可以通过函数体观察它是如何加载异步路由的。同样通过 flatMapComponents
遍历新增的路由记录，每次遍历都执行第二个回调函数
- 在回调函数里，会定义一个 resolve 函数，当异步组件加载完成后，会通过 then 的形式解析 promise，最终会调用resolve
函数并传入异步组件的配置项作为参数， resolve 函数接收到组件配置项后会像 Vue 中一样将配置项转为构造器 ，同时将值赋值
给当前路由记录的 componts 属性中(key 属性默认为 default)
- 另外 resolveAsyncComponents 函数会通过闭包保存一个 pending 变量，代表接收的异步组件数量，在flatMapComponents
遍历的过程中，每次会将 pending 加一，而当异步组件被解析完毕后再将 pending 减一，也就是说，当 pengding 为 0 时，代
表异步组件全部解析完成， 随即执行 next 方法，next 方法是 vue-router 控制整个路由导航顺序的核心方法


## 执行路由守卫
在分析 next 方法之前，我们先来看一下 vue-router 是如何处理 queue 数组中的元素的，在上文中，虽然定义了 queue 数
组，其中包括了路由守卫以及解析异步组件的函数，但是还没有执行,
``` js
// 因为路由之间的切换可能是异步的（可能会写setTimeout(next,2000)）
// 所以设计了一个队列，当前面一个元素被解析后调用next方法才继续解析下个元素
export function runQueue (queue: Array<?NavigationGuard>, /*fn指iterator*/fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      cb() //遍历结束后执行回调
    } else {
      if (queue[index]) {
          // queue[index]即hook函数
          // 第二个参数即 next 方法，解析队列中下个元素
          // 执行iterator函数，传入NavigationGuard（函数）组成的数组的每个元素，执行完后执行回调（index+1）
        fn(queue[index], /*runQueue next*/() => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
```
runQueue 内部声明了一个 step 的函数，它一个是控制 runQueue 是否继续遍历的函数，当我们第一次执行时，给 step 函数
传入参数 0 表示开始遍历 queue 第 1 个元素，通过 step 函数内部可以发现，它最终会执行参数 fn，也就是 iterator 这
个迭代器函数，给它传入当前遍历的 queue 元素以及一个回调函数，这个回调函数里保存着遍历下个元素的逻辑，也就是说runQueue
将是否需要继续遍历的控制权传入了 iterator 函数中

runQueue 函数只负责遍历数组，并不会执行逻辑，它依次遍历 queue 数组的元素，每次遍历时会将当前元素交给外部定义的
iterator 迭代器去执行，而 iterator 迭代器一旦处理完当前元素就让 runQueue 遍历下个元素，且当数组全部遍历结束
时，会执行作为回调的参数 cb

接下来我们看下迭代器函数
``` js
//runQueue每次遍历都会执行iterator函数并且传入当前的路由守卫函数进行解析，解析后会执行next回调（即step+1）
const iterator = (hook: NavigationGuard, next) => {
  if (this.pending !== route) {
    return abort()
  }
  try {
    //执行某个生命周期中的导航守卫,其实这里就是对应我们自己写的钩子中to from next三个参数
    //当在路由守卫中如果没有执行 next 函数，路由将无法跳转，原因是因为没有去执行 hook 的第三个
    //回调函数，也就不会执行 iterator 的第三个参数 next，最终导致不会通知 runQueue 继续往下遍历
    hook(route, current, /*iterator next*/(to: any) => {
      // 另外当我们给 next 函数传入另一个路径时，会取消原来的导航，取而代之跳转到指定的路径，原
      // 因是因为满足上图的 true 逻辑，执行 abort 函数取消导航，随后会调用 push/replace 将路由重新跳转到指定的页面
      if (to === false || isError(to)) {
        // next(false) -> abort navigation, ensure current URL
          // 如果传入的是next(false)会中断导航，并且会重置到form的路由
        this.ensureURL(true)
        abort(to)
      } else if ( //跳转到指定路由
        typeof to === 'string' ||
        (typeof to === 'object' && (
          typeof to.path === 'string' ||
          typeof to.name === 'string'
        ))
      ) {
        // next('/') or next({ path: '/' }) -> redirect
        abort() //取消导航并且执行push/replace跳转到指定路由
        if (typeof to === 'object' && to.replace) {
          this.replace(to)
        } else {
          this.push(to)
        }
      } else {
        // confirm transition and pass on the value
        // 如果next没有参数则直接执行runQueue next
        // 即解析queue的下个元素
        next(to)
      }
    })
  } catch (e) {
    abort(e)
  }
}
```
当 queue 最后一个元素也就是异步组件被解析完成后，runQueue 会执行传入的第三个参数，即执行遍历成功回调,分析代码可知
成功回调里 vue-router 又往 queue 中添加了路由守卫，同时会开启第二轮遍历,这个下期讲解.





