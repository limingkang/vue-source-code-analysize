module.exports = [
  {
    title: 'vue3源码',
    path: '/',
    collapsable: false,
    children: [
      ['/techAccumulate/vue-rfc', 'vue3和2响应式对比'],
      ['/vueReactive/code-analsize', 'vue3响应式源码讲解'],
      ['/easyInit/init', '核心渲染函数介绍'],
      ['/render/render', '渲染流程介绍'],
      ['/domDiff/dom-diff', 'dom diff'],
      ['/compiler/compiler', '编译函数介绍']
    ]
  },
  {
    title: 'vuex源码',
    collapsable: false,
    children: [
      ['/vuex/vuex-start', 'vuex初识'],
      ['/vuex/vuex-module', 'vuex模块部分'],
      ['/vuex/vuex-analyzed', '初始化挂载vue'],
      ['/vuex/vuex-api', '实例的api'],
      ['/vuex/vuex-help', '辅助函数介绍']
    ]
  },
  {
    title: '源码实现',
    collapsable: false,
    children: [
      ['/webpack/webpack', 'webpack打包原理'],
      ['/promise/promise', 'promise'],
      ['/promise/await', 'async、await原理'],
      ['/promise/class', 'class原理']
    ]
  }
]
