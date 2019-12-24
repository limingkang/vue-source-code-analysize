// const { createApp, reactive, computed, effect } = Vue;
// const RootComponent = {
//   template: `
//         <button @click="increment">
//           Count is: {{ state.count }}
//         </button>
//       `,
//   setup() {
//     const state = reactive({
//       count: 0,
//     })
//     // console.log(state);
//     for (const key in state) {
//       // console.log(state[key])
//     }
//     function increment() {
//       state.count++
//     }

//     return {
//       state,
//       increment
//     }
//   }
// }
// createApp().mount(RootComponent, '#container')
// 渲染流程步骤：
  // 1.整体打包流程在vue/src/index下面他导出了runtime-dom所有的方法，还设置了编译函数

  // 2.runtime-dom/src/index下面导出最重要的两个方法render和createApp这两个方法通过运行
  // runtime - core / src / createRenderer.ts文件中createRenderer方法返回出来，接受参数为
  // dom操作的方法和patchProp操作节点属性的方法

  // 3.其中createRenderer返回出来的createApp方法是runtime - core / src / apiApp.ts中的
  // createAppAPI方法所返回是一个可运行的函数

  // 4.当你运行createApp()会返回一个对象包括mount、directive、mixin等方法运行mount方法开始
  // 装载，先创建vnode，之后传入vnode调用render方法

  // 5.调用createRenderer.ts中render --> processComponent --> mountComponent(通过
  // component.ts中createComponentInstance方法生成组件实例并挂载到vnode.component)
  
  // 6.传入该实例调用component.ts中createComponentInstance方法，该方法主要把整个实例Proxy
  // 并挂载到实例的renderProxy上，运行初始化时候传入的setup方法

  // 7.调用component.ts中handleSetupResult方法传入setup运行返回值，如果返回值是函数则绑定到
  // 实例的render上，如果是对象则reactive化并绑定到renderContext上

  // 8.调用component.ts中finishComponentSetup方法该方法主要构造组件实例的render方法（如果不存
  // 在的话）也会绑定到实例type.render上，使用的是compile方法传入模版生成渲染函数(如果组件初始化
  // 时候有了render函数的话就直接赋值给实例render函数)

  // 9.调用createRenderer.ts中setupRenderEffect方法，该方法运行数据响应系统effect方法定义并
  // 运行数据响应时候对应的回调函数，函数中使用component.ts中renderComponentRoot方法生成模版
  // 字符串（实际上就是运行上面的render函数）并绑定到实例的subTree方法上

  // 10.传入上面的subTree之后运行patch --> processElement --> mountElement该方法里面就是
  // 创建节点并插入节点绑定响应点击事件

  // 11.当我点击按钮改变响应值的时候，就是触发setupRenderEffect方法中的effect传入的函数，并走他
  // 的更新逻辑，之后patch --> processElement --> patchElement --> hostSetElementText















// const Comp = createComponent({
//   data() {
//     return {
//       foo: 1
//     }
//   },
//   extends: {
//     data() {
//       return {
//         my: 1
//       }
//     }
//   },
//   watch: {
//     foo: function(val, oldval) {
//       console.log(val);
//     }
//   },
//   computed: {
//     bar() {
//       return this.foo + 1
//     },
//     baz() {
//       return this.bar + 1
//     }
//   },
//   render() {
//     return h(
//       'div',
//       {
//         onClick: () => {
//           this.foo++
//           console.log(this.my)
//         }
//       },
//       this.bar + this.baz
//     )
//   }
// })
// const vnode = h(Comp);
// render(vnode, '#container');
// h函数就是用来生成vnode的，render函数用来渲染，这里的方式和上面一样
// 不同在component.ts中finishComponentSetup中渲染函数是用组件里面的函数赋值的，不是compile编译出来
// 接着调用apiOptions.ts中applyOptions方法来处理组件,在里面处理组件所有参数
// 该方法把data函数返回值reactive化后绑到实例的data上面,之后把计算属性绑定到实例的renderContext上
// 计算属性绑定到renderContext，值为computed.ts中computed(组件初始化计算属性对应函数)

// 主要看下这里watch参数的使用过程，applyOptions中调用apiWatch.ts中watch方法，之后调用doWatch
// createRenderer.ts中queuePostRenderEffect之后到scheduler.ts中queuePostFlushCb方法(把所有
// 回调都写入postFlushCb数组)在里面使用nextTick以promise.then的形式触发flushJobs-- > flushPostFlushCbs
// 在该方法里面触发所有回调，这里的回调就是dowatch方法中的applyCb变量，该回调的触发方式采用统一的方法
// callWithAsyncErrorHandling




























