<!-- [github源码地址](https://github.com/limingkang/simulate-webpack-compile) -->
# 模仿webpack编译原理写一个模块打包工具

## 整体思路
* 初始化参数：从配置文件 和 Shell 语句中读取与合并参数，得出最终的参数； 
* 开始编译：用上一步得到的参数初始化 Compiler 对象，加载所有配置的插件，执行对象的 run 方法开始执行编译；
* 确定入口：根据配置中的 entry 找出所有的入口文件；
* 编译模块：从入口文件出发，调用所有配置的 Loader 对模块进行翻译，再找出该模块依赖的模块，再递归此步骤直到所有入口依赖的文件都经过了处理；
* 完成模块编译：在经过第4步使用 Loader 翻译完所有模块后，得到了每个模块被翻译后的最终内容以及它们之间的依赖关系；
* 输出资源：根据入口和模块之间的依赖关系，组装成一个个包含多个模块的 Chunk，再把每个 Chunk 转换成一个单独的文件加入到输出列表，这步是可以修改输出内容的最后机会；
* 输出完成：在确定好输出内容后，根据配置确定输出的路径和文件名，把文件内容写入到文件系统。
在以上过程中，Webpack 会在特定的时间点广播出特定的事件，插件在监听到感兴趣的事件后会执行特定的逻辑，并且插件可以调用 Webpack 提供的 API 改变 Webpack 的运行结果。

### webpack 中的 hooks
* entryOption 读取配置文件
* afterPlugins 加载所有的插件
* run 开始执行编译流程
* compile 开始编译
* afterCompile 编译完成
* emit 写入文件
* done 完成整体流程

### 文件介绍
* 1  新建两个目录 `sourcepack`(自实现打包工具目录) 和 `usewebpack`(模拟项目目录);

`usewebpack 的目录结构如下`

```
├── src                      # 源码目录
│   ├── a                    # 模块代码
│   ├── loaders              # 存放自己实现的loadder文件
│   ├── plugins              # 存放自己实现的plugin文件
│   ├── index.js             # 入口文件
│   ├── index.less           # less文件
├── webpack.config.json      # webpack 配置文件
├── package.json             # 项目描述
```

`sourcepack 的目录结构如下`

```
├── bin                      # 主文件目录
│   ├── sourcepack.js        # 主文件
├── lib                      # 工具类目录
│   ├── compiler.js          # compiler 类
│   ├── main.ejs             # ejs 模版
├── package.json             # 项目描述
```

1, 分别进入sourcepack和usepack文件夹npm install

2, 执行 `npm link ` 建立软连接,是sourcepack命令全局化
npm ls --global sourcepack  可以查看sourcepack命令是否存在
sudo npm rm --global sourcepack 可以删除sourcepack命令

3, 在usewebpack 目录执行sourcepack 命令从而打出bundle包

* 可以在dist目录新建index.html引用此包验证下是否成功
```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Document</title>
</head>
<body>
	<h1>sourcePack</h1>
	<script src="./bundle.js"></script>
</body>
</html>

```


## Webpack 核心模块 tapable
在 tapable 解构的 SyncHook 是一个类，注册事件需先创建实例，创建实例时支持传入一个数组，数组内存储事件触发时传入
的参数，实例的 tap 方法用于注册事件，支持传入两个参数，第一个参数为事件名称，在 Webpack 中一般用于存储事件对应的
插件名称（名字随意，只是起到注释作用）， 第二个参数为事件处理函数，函数参数为执行 call 方法触发事件时所传入的参数的形参
``` js
// SyncHook 钩子的使用
const { SyncHook } = require("tapable");

// 创建实例
let syncHook = new SyncHook(["name", "age"]);

// 注册事件
syncHook.tap("1", (name, age) => console.log("1", name, age));
syncHook.tap("2", (name, age) => console.log("2", name, age));
syncHook.tap("3", (name, age) => console.log("3", name, age));

// 触发事件，让监听函数执行
syncHook.call("panda", 18);

// 1 panda 18
// 2 panda 18
// 3 panda 18
```
tasks 数组用于存储事件处理函数，call 方法调用时传入参数超过创建 SyncHook 实例传入的数组长度时，多余
参数可处理为 undefined，也可在参数不足时抛出异常，不灵活，后面的例子中就不再这样写了
``` js
// 模拟 SyncHook 类
class SyncHook {
    constructor(args) {
        this.args = args;
        this.tasks = [];
    }
    tap(name, task) {
        this.tasks.push(task);
    }
    call(...args) {
        // 也可在参数不足时抛出异常
        if (args.length < this.args.length) throw new Error("参数不足");

        // 传入参数严格对应创建实例传入数组中的规定的参数，执行时多余的参数为 undefined
        args = args.slice(0, this.args.length);

        // 依次执行事件处理函数
        this.tasks.forEach(task => task(...args));
    }
}
```

## 核心代码实现
``` js
// 编译时候就触发此代码
const path = require("path");
const fs = require("fs");
const root = process.cwd();
const configPath = path.join(root,"webpack.config.js");
const config = require(configPath);
const Compiler = require('../lib/Compiler');
const compiler = new Compiler(config);
//发射 entryOption 事件
compiler.hooks.entryOption.call(config);
compiler.run();
```

看下编译代码的实现
``` js
class Compiler{
	constructor(options){
		//取得当前工作目录
		this.root = process.cwd();
		//存放着所有的模块 moduleId => 原代码
		this.modules = {};
		this.options = options;
		this.hooks = {
			entryOption:new SyncHook(['config']),
			afterPlugins:new SyncHook(['afterPlugins']),
			run:new SyncHook(['run']),
			compile:new SyncHook(['compile']),
			afterCompile:new SyncHook(['afterCompile']),
			emit:new SyncHook(['emit']),
			done:new SyncHook(['done'])
		}
		let plugins = options.plugins;
		if(plugins&&plugins.length>0)
			plugins.forEach(plugin=>{
				plugin.apply(this);
			})
		//触发插件挂载完成事件
		this.hooks.afterPlugins.call(this);
	}
	// 找到入口文件 开始编译
	run(){
		const { 
			entry, 
			output:{ path: pathName, filename }
		}= this.options;
		let _this = this;
		const entryPath = path.join(this.root,entry);

		this.hooks.compile.call(this);
		this.parseModule(entryPath,true);
		this.hooks.afterCompile.call(this);

		let bundle = ejs.compile(fs.readFileSync(path.join(__dirname,'main.ejs'),"utf8"))({
			modules:this.modules,entryId:this.entryId
		});

		this.hooks.emit.call(this);

		fs.writeFileSync(path.join(pathName,filename),bundle);

		this.hooks.done.call(this);
        	
	}

	parseModule(modulePath,isEntry){
		const { 
			module: { rules } ,
			resolveLoader:{ modules: loaderPath }
		}= this.options;
		//取得入口文件内容 
		let source = fs.readFileSync(modulePath,'utf8');

		for (var i =0;i < rules.length; i++) {
			let rule = rules[i];
			if(rule.test.test(modulePath)){
				let loaders = rule.use||rule.loader;
				if( Object.prototype.toString.call(loaders)==='[object Array]'){
					
					for(let j = loaders.length-1;j>=0;j--){
						let loader = loaders[j];
						loader = require(path.join(this.root,loaderPath,loader));
						source = loader(source);
					}

				}else if( Object.prototype.toString.call(loaders)=== "[object Object]"){
					loaders  = loader.loader;
				}
			}
		}
		let parentPath = path.relative(this.root,modulePath);
		//TODO 执行loader 进行转换 
		let result = this.parse(source,path.dirname(parentPath));//用来解析模块内容并返回依赖的模块 

		this.modules['./'+parentPath] = result.source;
		if(isEntry) { this.entryId = './'+parentPath };

        let requires = result.requires;
        if( requires && requires.length>0){
        	requires.forEach(function(req){
        		this.parseModule(path.join(this.root,req));
        	}.bind(this))
        }
	}
	//对文件内容进行转义。1.处理文件中的路径引用问题 2，生成新的代码
	parse(source,parentPath){ // parentPath 相对路径 
		//生成AST
		let ast = esprima.parse(source);
		//存放引用文件的路径
		const requires = [];
		//遍历语法树。1.找到此模块依赖的模块 2，替换掉老的加载路径 
		estraverse.replace(ast,{
			enter(node,parent){
				if(node.type == "CallExpression" && node.callee.name == "require"){
					let name = node.arguments[0].value;
					name += (name.lastIndexOf('.')>0?"":".js");
				    let moduleId = "./"+path.join(parentPath,name);
				    requires.push(moduleId);
				    node.arguments= [{type:"Literal",value:moduleId}];
				    //返回新节点替换老节点
				    return node; 
				}
			}
		});
		source = escodegen.generate(ast);
		return { requires, source };
	}
}
```
webpack.config实现
``` js
module.exports = {
	entry:"./src/index.js",
	mode:"development",
	output:{
		path:path.resolve("dist"),
		filename:"bundle.js"
	},
	resolveLoader:{
		modules:'./src/loaders'
	},
	module:{
		rules:[{
			test:/\.less$/,
			loader:['style-loader','less-loader']
		}]
	},
	plugins:[
		new entryOptionPlugin()
	]
}
```
介绍下插件的实现
``` js
// compiler钩子参考链接   https://www.webpackjs.com/api/compiler-hooks/
class entryOptionPlugin {
	constructor(options){

	}
	apply(compiler){
		compiler.hooks.entryOption.tap('entryOptionPlugin',function(options){
			console.log("参数解析完毕...")
    });
    // 可以打印出所有的钩子,注意这里是我自己实现的钩子只有简单几个，官网上给出了所有钩子
    // for (var hook of Object.keys(compiler.hooks)) {
    //   console.log(hook);
    // }
	}
}
module.exports = entryOptionPlugin;

 
1.从表现上看，Compiler暴露了和webpack整个生命周期相关的钩子，通过如下的方式访问:
//基本写法
compiler.hooks.someHook.tap(...)
//如果希望在entry配置完毕后执行某个功能
compiler.hooks.entryOption.tap(...)
//如果希望在生成的资源输出到output指定目录之前执行某个功能
compiler.hooks.emit.tap(...)

2.根据webpack官方文档的说明，一个自定义的plugin需要包含：
  一个javascript命名函数
  插件函数的prototype上要有一个apply方法
  指定一个绑定到webpack自身的事件钩子
  注册一个回调函数来处理webpack实例中的指定数据
  处理完成后调用webpack提供的回调
官网给出了一个基本的结构示例：
  //console-log-on-build-webpack-plugin.js
  const pluginName = 'ConsoleLogOnBuildWebpackPlugin';
  class ConsoleLogOnBuildWebpackPlugin {
    apply(compiler){
        compiler.hooks.run.tap(pluginName, compilation=>{
            console.log('webpack构建过程开始');
        });
    }
  }

3.比较重要的两个钩子Compilation 实例继承于 compiler例如，compiler.compilation 是对
所有 require 图(graph)中对象的字面上的编译。这个对象可以访问所有的模块和它们的依赖（大部
分是循环依赖）。在编译阶段，模块被加载，封闭，优化，分块，哈希和重建等等。这将是任何编译操作
中，重要的生命周期
  compiler 对象代表的是不变的webpack环境，是针对webpack的
  compilation 对象针对的是随时可变的项目文件，只要文件有改动，compilation就会被重新创建
```
介绍下style-loader
``` js
module.exports = function(source){
	let style = `
		let style = document.createElement('style');
		style.innerHTML = ${JSON.stringify(source)};
		document.head.appendChild(style);
	`;
	return style;
}
```



## webpack打包之后的文件分析
### webpack的模块不仅指js，包括css、图片等资源都可以以模块看待，但现在我们只关注js，首先我们创建一个简单入口模块index.js和一个依赖模块bar.js 先使用commonjs规范
``` js
//index.js
'use strict';
var bar = require('./bar');
function foo() {
    return bar.bar();
}

//bar.js
'use strict';
exports.bar = function () {
    return 1;
}

//webpack配置如下
var path = require("path");
module.exports = {
    entry: path.join(__dirname, 'index.js'),
    output: {
        path: path.join(__dirname, 'outs'),
        filename: 'index.js'
    },
};
```
这是一个最简单的配置，只指定了模块入口和输出路径，但已经满足了我们的要求。在根目录下执行
webpack，得到经过webpack打包的代码如下
``` js
// 浏览器本身不支持模块化，那么webpack就用函数作用域来hack模块化的效果。
// 如果你debug过node代码，你会发现一样的hack方式，node中的模块也是函数，跟模块相关的参数exports、
// require，或者其他参数__filename和__dirname等都是通过函数传值作为模块中的变量，模块与外部模块的
// 访问就是通过这些参数进行的，当然这对开发者来说是透明的
(function(modules) { // webpackBootstrap
    // 模块缓存对象
    var installedModules = {};
    // webpack实现的require
    function __webpack_require__(moduleId) {
        // 判断是否已缓存模块
        if(installedModules[moduleId]) {
            return installedModules[moduleId].exports;
        }
        // 创建新模块并缓存
        var module = installedModules[moduleId] = {
            i: moduleId,
            l: false,
            exports: {}
        };
        // 调用模块函数，注意这里做了一个动态绑定，将模块函数的调用对象绑定为module.exports
        // 这是为了保证在模块中的this指向当前模块
        modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
        // 标记模块为已加载
        module.l = true;
        // 返回module.exports
        return module.exports;
    }
    // expose the modules object (__webpack_modules__)
    __webpack_require__.m = modules;
    // expose the module cache
    __webpack_require__.c = installedModules;
    // define getter function for harmony exports
    __webpack_require__.d = function(exports, name, getter) {
        if(!__webpack_require__.o(exports, name)) {
            Object.defineProperty(exports, name, {
                configurable: false,
                enumerable: true,
                get: getter
            });
        }
    };
    // getDefaultExport function for compatibility with non-harmony modules
    __webpack_require__.n = function(module) {
        var getter = module && module.__esModule ?
            function getDefault() { return module['default']; } :
            function getModuleExports() { return module; };
        __webpack_require__.d(getter, 'a', getter);
        return getter;
    };
    // Object.prototype.hasOwnProperty.call
    __webpack_require__.o = function(object, property) { 
      return Object.prototype.hasOwnProperty.call(object, property); 
    };
    // __webpack_public_path__
    __webpack_require__.p = "";
    // require第一个模块, 就是入口文件模块
    return __webpack_require__(__webpack_require__.s = 0);
})
/************************************************************************/
([
/* 0 */
(function(module, exports, __webpack_require__) {

"use strict";

var bar = __webpack_require__(1);
bar.bar();

}),
/* 1 */
// webpack传入的第一个参数module是当前缓存的模块，包含当前模块的信息和exports；第二个参数exports是
// module.exports的引用，这也符合commonjs的规范；第三个__webpack_require__ 则是require的实现
(function(module, exports, __webpack_require__) {

"use strict";

exports.bar = function () {
    return 1;
}

})
]);
```
在我们的模块中，就可以对外使用module.exports或exports进行导出，使用__webpack_require__导入需要的模
块，代码跟commonjs完全一样，这样，就完成了对第一个模块的require，然后第一个模块会根据自己对其他模块的require，依次加载其他模块，最终形成一个依赖网状结构。webpack管理着这些模块的缓存，如果一个模块被require多次，那么只会有一次加载过程，而返回的是缓存的内容，这也是commonjs的规范

### 现在我们使用es6模块化，依然写两个文件，m.js文件用es模块的方式export一个default函数和一个foo函数，index.js import该模块
``` js
// m.js
'use strict';
export default function bar () {
    return 1;
};
export function foo () {
    return 2;
}

// index.js
'use strict';
import bar, {foo} from './m';
bar();
foo();

// webpack配置没有变化，依然以index.js作为入口
var path = require("path");
module.exports = {
    entry: path.join(__dirname, 'index.js'),
    output: {
        path: path.join(__dirname, 'outs'),
        filename: 'index.js'
    },
};
```
重新执行webpack后生成的代码如下（只截取IIFE的参数部分）
``` js
[
(function(module, __webpack_exports__, __webpack_require__) {

    "use strict";
    // 定义该模块为es模块
    Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
    /* harmony import */
    var __WEBPACK_IMPORTED_MODULE_0__m__ = __webpack_require__(1);
    // 引入的模块属性都会用Object()包装成对象，这是为了保证像Boolean、String、Number这些
    // 基本数据类型转换成相应的类型对象
    Object(__WEBPACK_IMPORTED_MODULE_0__m__["a" /* default */])();
    Object(__WEBPACK_IMPORTED_MODULE_0__m__["b" /* foo */])();

}),
// export default和export都被转换成了类似于commonjs的exports.xxx，这里也已经不区分是不是default
// export了，所有的export对象都是__webpack_exports__的属性
(function(module, __webpack_exports__, __webpack_require__) {

    "use strict";
    /* harmony export (immutable) */
    __webpack_exports__["a"] = bar;
    /* harmony export (immutable) */
    __webpack_exports__["b"] = foo;

    function bar () {
        return 1;
    };
    function foo () {
        return 2;
    }

})
]
```


### commonjs与es6 module混用，这里只介绍下es模块对commonjs模块的导入，其他原理一样
下面用具体代码来解释一下，首先修改m.js和index.js代码如下
``` js
// m.js
'use strict';
exports.foo = function () {
    return 1;
}

// index.js
'use strict';
import m from './m';
m.foo();
```
重新执行webpack后生成的代码如下（只截取IIFE的参数部分）
``` js
[
/* 0 */
(function(module, __webpack_exports__, __webpack_require__) {

    "use strict";
    Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
    /* harmony import */ 
    var __WEBPACK_IMPORTED_MODULE_0__m__ = __webpack_require__(1);
    /* 
    对导出的commonjs模块再做一次包装

    __webpack_require__.n会判断module是否为es模块，当__esModule为true的时候，标识module为es模
    块，那么module.a默认返回module.default，否则返回module

    __webpack_require__.n会判断module是否为es模块，当__esModule为true的时候，标识module为es模
    块，那么module.a默认返回module.default，否则返回module

    具体实现则是通过 __webpack_require__.d将具体操作绑定到属性a的getter方法上的
    */ 
    var __WEBPACK_IMPORTED_MODULE_0__m___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_0__m__);

    __WEBPACK_IMPORTED_MODULE_0__m___default.a.foo();

}),
/* 1 */
(function(module, exports, __webpack_require__) {

    "use strict";
    exports.foo = function () {
        return 1;
    }

})
]
```

## Code Splitting原理
webpack的模块化不仅支持commonjs和es module，还能通过code splitting实现模块的动态加载，首先我们依然
创建一个简单入口模块index.js和两个依赖模块foo.js和bar.js
``` js
// index.js
'use strict';
import(/* webpackChunkName: "foo" */ './foo').then(foo => {
    console.log(foo());
})
import(/* webpackChunkName: "bar" */ './bar').then(bar => {
    console.log(bar());
})

// foo.js
'use strict';
exports.foo = function () {
    return 2;
}

// bar.js
'use strict';
exports.bar = function () {
    return 1;
}

// webpack配置如下
var path = require("path");
module.exports = {
    entry: path.join(__dirname, 'index.js'),
    output: {
        path: path.join(__dirname, 'outs'),
        filename: 'index.js',
        chunkFilename: '[name].bundle.js'  //不指定会有默认文件名
    },
};
```
在根目录下执行webpack，得到经过webpack打包的代码如下
``` js
(function(modules) {
    // 省略和和正常打包相同的代码，只留下不同代码
    var parentJsonpFunction = window["webpackJsonp"];
    // 将每个chunk存入到resolves中，并最后依次执行，另外还行chunk里模块缓存到modules变量。
    window["webpackJsonp"] = function webpackJsonpCallback(chunkIds, moreModules,
     executeModules) {
        // add "moreModules" to the modules object,
        // then flag all "chunkIds" as loaded and fire callback
        var moduleId, chunkId, i = 0, resolves = [], result;
        for(;i < chunkIds.length; i++) {
            chunkId = chunkIds[i];
            if(installedChunks[chunkId]) {
                // 存入每个chunk的resolve方法
                resolves.push(installedChunks[chunkId][0]);
            }
            installedChunks[chunkId] = 0;
        }
        for(moduleId in moreModules) {
            // 缓存对应模块
            if(Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
                modules[moduleId] = moreModules[moduleId];
            }
        }
        if(parentJsonpFunction) parentJsonpFunction(chunkIds, moreModules,
        executeModules);
        // 运行所有resolve
        while(resolves.length) {
            resolves.shift()();
        }
    };
    // The module cache
    var installedModules = {};
    // chunks缓存
    var installedChunks = {
        2: 0
    };
    // 异步加载方法实现
    __webpack_require__.e = function requireEnsure(chunkId) {
        var installedChunkData = installedChunks[chunkId];
        // 从缓存installedChunks中查找是否有缓存模块，如果缓存标识为0，则表示模块已加载过，直接返回
        // promise；如果缓存为数组，表示缓存正在加载中，则返回缓存的promise对象
        if(installedChunkData === 0) {
            return new Promise(function(resolve) { resolve(); });
        }
        该值是一个数组第一个值是resolve第二个reject第三个值就是对应的promise 
        if(installedChunkData) {
            return installedChunkData[2];
        }
        // setup Promise in chunk cache
        var promise = new Promise(function(resolve, reject) {
            installedChunkData = installedChunks[chunkId] = [resolve, reject];
        });
        // 赋值promise
        installedChunkData[2] = promise;
        // 开始chunk loading
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.async = true;
        script.timeout = 120000;
        if (__webpack_require__.nc) {
            script.setAttribute("nonce", __webpack_require__.nc);
        }
        script.src = __webpack_require__.p + "" + ({"0":"foo","1":"bar"}[chunkId]||
        chunkId) + ".bundle.js";
        // 添加script标签onload、onerror事件，如超时或模块加载失败，则调reject返回模块加载失败异常
        var timeout = setTimeout(onScriptComplete, 120000);
        script.onerror = script.onload = onScriptComplete;
        function onScriptComplete() {
            // avoid mem leaks in IE.
            script.onerror = script.onload = null;
            clearTimeout(timeout);
            var chunk = installedChunks[chunkId];
            if(chunk !== 0) {
                if(chunk) {
                    chunk[1](new Error('Loading chunk ' + chunkId + ' failed.'));
                }
                installedChunks[chunkId] = undefined;
            }
        };
        head.appendChild(script);
        return promise;
    };
    // on error function for async loading
    __webpack_require__.oe = function(err) { console.error(err); throw err; };
    // Load entry module and return exports
    return __webpack_require__(__webpack_require__.s = 0);
})
([
(function(module, exports, __webpack_require__) {
    "use strict";
    // 0是chunkId 1是moduleId
    __webpack_require__.e/* import() */(0).then(__webpack_require__.bind(null, 1))
    .then(foo => {
        console.log(foo());
    })
    __webpack_require__.e/* import() */(1).then(__webpack_require__.bind(null, 2))
    .then(bar => {
        console.log(bar());
    })
})
]);

// 对应其中一个chunk文件内容如下
webpackJsonp([0],{
  1,
  (function(module, exports, __webpack_require__) {
  "use strict";
  exports.foo = function () {
      return 2;
  }
  })
});
```
每个chunkId对应的是一个js文件，每个moduleId对应的是一个个js文件的内容的模块（一个js文件里面可以require多个资源，每个资源分配一个moduleId），所以它两的关系就是一个chunkId可能由很多个moduleId组成

当我们需要动态加载某些组件的时候例如vue-router配合使用时候其实就是，点击到某个路由之后触发该动态加载
方法大概编译后代码如下
``` js
exports.default = {
  childRoutes: [{
    path: 'about',
    getComponent: function getComponent(location, cb) {
      __webpack_require__.e/* import() */(2).then(__webpack_require__.bind(null, 268)).then(loadRoute(cb)).catch(errorLoading);
    }
  }
};
```
由上面代码可以看到，当路径访问about时候，就调取对应的getComponent函数，这个函数里面首先执行
__webpack_require__.e方法，成功再通过then执行__webpack_require__方法，即先去加载chunk文
件，然后再去加载当前chunk文件里的模块，因此我们可以从这里推断出，上面方法中由两个数字2和268 ，
这两个数字肯定就是chunkId和modleId了, 这个2和268肯定就是在about-chunk.js文件中了
``` js
// 这只是其中随便一个项目的例子，大概thunk就生成这个样子
// 这个文件里直接调用了webpackJsonp方法，而这个方法第一个参数就是chunkIds 列表，而
// 第二个参数就是一个moduleId与模块的对象
webpackJsonp([2],{
 
/***/ 268:
/***/ (function(module, exports, __webpack_require__) {
"use strict";
 
 
Object.defineProperty(exports, "__esModule", {
  value: true
});
 
var _react = __webpack_require__(13);
 
var _react2 = _interopRequireDefault(_react);
 
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
 
var About = function About() {
  return _react2.default.createElement(
    'div',
    null,
    'About'
  );
};
 
exports.default = About;
 
/***/ })
 
});
```



## webpack优化

### resolve字段告诉webpack怎么去搜索文件
1. 设置resolve.modules:[path.resolve(__dirname, 'node_modules')]避免层层查找。
resolve.modules告诉webpack去哪些目录下寻找第三方模块，默认值为['node_modules']，会依次查找./node_modules、../node_modules、../../node_modules。

2. 设置resolve.mainFields:['main']，设置尽量少的值可以减少入口文件的搜索步骤
第三方模块为了适应不同的使用环境，会定义多个入口文件，mainFields定义使用第三方模块的哪个入口文件，由于大多数第三方模块都使用main字段描述入口文件的位置，所以可以设置单独一个main值，减少搜索

3. 对庞大的第三方模块设置resolve.alias, 使webpack直接使用库的min文件，避免库内解析
如对于react：
``` js
resolve.alias:{
    'react':patch.resolve(__dirname, './node_modules/react/dist/react.min.js')
}
```
这样会影响Tree-Shaking，适合对整体性比较强的库使用，如果是像lodash这类工具类的比较分散的库，比较适合Tree-Shaking，避免使用这种方式

4. 合理配置resolve.extensions，减少文件查找默认值：extensions:['.js', '.json'],当导入语句没带
文件后缀时，Webpack会根据extensions定义的后缀列表进行文件查找，所以：列表值尽量少;频率高的文件类型
的后缀写在前面;源码中的导入语句尽可能的写上文件后缀，如require(./data)要写成require(./data.json)

5. module.noParse字段告诉Webpack不必解析哪些文件，可以用来排除对非模块化库文件的解析
如jQuery、ChartJS，另外如果使用resolve.alias配置了react.min.js，则也应该排除解析，因为react.min.js经过构建，已经是可以直接运行在浏览器的、非模块化的文件了。noParse值可以是RegExp、[RegExp]、function、module:{ noParse:[/jquery|chartjs/, /react\.min\.js$/] }

6. 配置loader时，通过test、exclude、include缩小搜索范围

### 使用DllPlugin减少基础模块编译次数
DllPlugin动态链接库插件，其原理是把网页依赖的基础模块抽离出来打包到dll文件中，当需要导入的模块存在于某个dll中时，这个模块不再被打包，而是去dll中获取。为什么会提升构建速度呢？原因在于dll中大多包含的是常用的第三方模块，如react、react-dom，所以只要这些模块版本不升级，就只需被编译一次。我认为这样做和配置resolve.alias和module.noParse的效果有异曲同工的效果
1. 使用DllPlugin配置一个webpack_dll.config.js来构建dll文件：
``` js
// webpack_dll.config.js
const path = require('path');
const DllPlugin = require('webpack/lib/DllPlugin');
module.exports = {
 entry:{
     react:['react','react-dom'],
     polyfill:['core-js/fn/promise','whatwg-fetch']
 },
 output:{
     filename:'[name].dll.js',
     path:path.resolve(__dirname, 'dist'),
     library:'_dll_[name]',  //dll的全局变量名
 },
 plugins:[
     new DllPlugin({
         name:'_dll_[name]',  //dll的全局变量名
         path:path.join(__dirname,'dist','[name].manifest.json'),//描述生成的manifest文件
     })
 ]
}
```
需要注意DllPlugin的参数中name值必须和output.library值保持一致，并且生成的manifest文件中会引用output.library值。最终构建出的文件：
``` js
|-- polyfill.dll.js
|-- polyfill.manifest.json
|-- react.dll.js
└── react.manifest.json
```
其中xx.dll.js包含打包的n多模块，这些模块存在一个数组里，并以数组索引作为ID，通过一个变量假设为_xx_dll暴
露在全局中，可以通过window._xx_dll访问这些模块。xx.manifest.json文件描述dll文件包含哪些模块、每个模
块的路径和ID。然后再在项目的主config文件里使用DllReferencePlugin插件引入xx.manifest.json文件
2. 在主config文件里使用DllReferencePlugin插件引入xx.manifest.json文件
``` js
//webpack.config.json
const path = require('path');
const DllReferencePlugin = require('webpack/lib/DllReferencePlugin');
module.exports = {
    entry:{ main:'./main.js' },
    //... 省略output、loader等的配置
    plugins:[
        new DllReferencePlugin({
            manifest:require('./dist/react.manifest.json')
        }),
        new DllReferenctPlugin({
            manifest:require('./dist/polyfill.manifest.json')
        })
    ]
}
```

### 使用HappyPack开启多进程Loader转换
在整个构建流程中，最耗时的就是Loader对文件的转换操作了，而运行在Node.js之上的Webpack是单线程模型的，也
就是只能一个一个文件进行处理，不能并行处理。HappyPack可以将任务分解给多个子进程，最后将结果发给主进程。
JS是单线程模型，只能通过这种多进程的方式提高性能
``` js
const path = require('path');
const HappyPack = require('happypack');

module.exports = {
    //...
    module:{
        rules:[{
                test:/\.js$/，
                use:['happypack/loader?id=babel']
                exclude:path.resolve(__dirname, 'node_modules')
            },{
                test:/\.css/,
                use:['happypack/loader?id=css']
            }],
        plugins:[
            new HappyPack({
                id:'babel',
                loaders:['babel-loader?cacheDirectory']
            }),
            new HappyPack({
                id:'css',
                loaders:['css-loader']
            })
        ]
    }
}
```
除了id和loaders，HappyPack还支持这三个参数：threads、verbose、threadpool，threadpool代表共享进程
池，即多个HappyPack实例都用同个进程池中的子进程处理任务，以防资源占用过多


### 其他小tips
使用UglifyJS插件压缩JS代码时，需要先将代码解析成Object表示的AST（抽象语法树），再去应用各种规则去分析和
处理AST，所以这个过程计算量大耗时较多。ParallelUglifyPlugin可以开启多个子进程，每个子进程使用
UglifyJS压缩代码，可以并行执行，能显著缩短压缩时间,使用也很简单，把原来的UglifyJS插件换成本插件即可

一个中大型应用中，第三方的依赖，庞大得可怕，占据了打包后文件的一半以上。然而，这些依赖模块又是很少变更的资
源，和css 代码分离的逻辑相似，分离第三方依赖库，可以更好的利用浏览器缓存，提升应用性能。因此，将依赖模块从
业务代码中分离是性能优化重要的一环。webpack4.0 中，依赖库的分离只需要通过 optimization.splitChunks 
进行配置即可

最主要的一点是我们希望更好的利用浏览器的缓存，当单独修改了样式时，独立的css文件可以不需要应用去加载整个的
脚本文件，提高效率。并且，当遇到多页面的应用时，可以单独将一些公共部分的样式抽离开来，加载一个页面后，接下
来的页面同样可以利用缓存来减少请求。webpack4.0 中提供了抽离css文件的插件，mini-css-extract-plugin,
只需要简单的配置便可以将css文件分离开来

webpack 在构建中提供了不少于7种的sourcemap模式，其中eval模式虽然可以提高构建效率，但是构建后的脚本较
大，因此生产上并不适用。而source-map 模式可以通过生成的 .map 文件来追踪脚本文件的 具体位置，进而缩小脚
本文件的体积，这是生产模式的首选，并且在生产中，我们需要隐藏具体的脚本信息，因此可以使用 cheap 和module 
模式来达到目的。综上，在生产的webpack devtool选项中，我们使用 cheap-module-source-map的配置
开发环境下将devtool设置为cheap-module-eval-source-map

热更新、懒加载、压图片，做雪碧图，配置cache：true，是否启用缓存来提升构建速度

配置babel-loader时，use: [‘babel-loader?cacheDirectory’] cacheDirectory用于缓存babel的编译结
果，加快重新编译的速度。另注意排除node_modules文件夹，因为文件都使用了ES5的语法，没必要使用Babel转换
