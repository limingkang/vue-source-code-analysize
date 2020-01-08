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