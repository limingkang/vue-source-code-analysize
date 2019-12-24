const slidebar = require('./router');

module.exports = {
  title: '前端学习',
  port: 7777,
  base: '/vue-source-code-analysize/',
  // dest: '../../../docs/dist/',
  description: 'vue3源码分析',
  themeConfig: {
    nav: [],
    sidebar: slidebar
  },
};
