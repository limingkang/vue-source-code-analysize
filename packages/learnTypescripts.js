//类型别名会给一个类型起个新名字。 类型别名有时和接口很像，但是可以作用于原始值，联合类型，元
//组以及其它任何你需要手写的类型



// 当你使用泛型类时候
// 在TypeScript使用泛型创建工厂函数时，需要引用构造函数的类类型
// interface ParameterlessConstructor<T = any> {
//   new(): { hi: T };  //这里其实是做映射，只取出hi对应的值
// }
// class ExampleOne {
//   hi() {
//     alert('Hi');
//   }
//   test() { }
// }
// class Creator<T> {
//   private ctor: ParameterlessConstructor<T>
//   constructor(_ctor: ParameterlessConstructor<T>) {
//     this.ctor = _ctor;
//   }
//   // 也可以直接这样写
//   constructor(private ctor: ParameterlessConstructor<T>) {}
//   getNew() {
//     return new this.ctor();
//   }
// }
// var creator = new Creator(ExampleOne);
// var example = creator.getNew();
// example.hi();   //这里只能取到hi方法，不能取到test



// ts的函数重载
// 参数的名字都无所为关键个数得一一对应
// export function test(type: string, children: string): string
// export function test(
//   type: number,
//   props: number
// ): string
// export function test(
//   type: string | number,
//   propsOrChildren: string | number,  //这个参数对应上面的定义，他至少得包含上面的所有类型
//   children?: string | number
// ): string {
//   return ' ste'
// }


// 泛型约束, 相比于操作any所有类型，我们想要限制函数去处理任意带有.length属性的所有类型。 只
// 要传入的类型有这个属性，我们就允许，就是说至少包含这一属性。 为此，我们需要列出对于T的约束要求
// 为此，我们定义一个接口来描述约束条件。 创建一个包含.length属性的接口，使用这个接口和extends关
// 键字来实现约束：
// interface Lengthwise {
//   length: number;
// }
// function loggingIdentity<T extends Lengthwise>(arg: T): T {
//   console.log(arg.length);  // Now we know it has a .length property, so no more error
//   return arg;
// }
// function loggingIdentity<T>(arg: T): T {
//   console.log(arg.length);  // Error: T doesn't have .length
//   return arg;
// }



//ts文档上对Record的介绍不多，但却经常用到，Record是一个很好用的工具类型
// type proxyKType = Record<K,T>
// K可以是联合类型、对象、枚举
// 即将K中的每个属性([P in K]),都转为T类型
// type petsGroup = 23 | 'cat' | 'fish';
// interface IPetInfo {
//   name: string,
//   age: number,
// }
// type IPets = Record<petsGroup, IPetInfo>;
// const animalsInfo: IPets = {
//   23: {
//     name: 'dogName',
//     age: 2
//   },
//   cat: {
//     name: 'catName',
//     age: 3
//   },
//   fish: {
//     name: 'fishName',
//     age: 5
//   }
// }
// let myAdd = (x: any): x is Record<any, any> => x;
//Record<any, any>就是将每一个x中的每一个属性转换为任何类型，这里x也可以是K可以是联合类型、对象、枚举



// 这叫做“按上下文归类”，是类型推论的一种
// 尝试这个例子的时候，你会发现如果你在赋值语句的一边指定了类型但是另一边没有类型的话
// TypeScript编译器会自动识别出类型：
// // myAdd has the full function type
// let myAdd = function (x: number, y: number): number { return x + y; };
// // The parameters `x` and `y` have the type number
// let myAdd: (baseValue: number, increment: number) => number =
//   function (x, y) { return x + y; };




// export interface VNode<HostNode = any, HostElement = any> {
//   _isVNode: true
//   props: Record<any, any> | null
//   anchor: HostNode | null
//   target: HostElement | null
// }
// 根据初始化传入的anchor值的属性来确定HostNode这个是啥类型
// type VNodeChildAtom<HostNode, HostElement> =
//   | VNode<HostNode, HostElement>
//   | string
//   | number
//   | boolean
//   | null
//   | void
// export interface VNodeChildren<HostNode = any, HostElement = any>
//   extends Array<
//   VNodeChildAtom<HostNode, HostElement>
//   > { }
// function printLabel(labelledObj: VNodeChildren) {
//   console.log(labelledObj);
// }
// printLabel([{ _isVNode: true, props: {}, anchor: 23, target: 'adsfasd' }]);
// printLabel([23, 54, 'fasdf']);
// VNodeChildren接口主要是控制里面是什么样的数组格式

// export interface VNodeChildren<HostNode = any, HostElement = any>
//   extends Array<
//   | VNodeChildren<HostNode, HostElement> | VNodeChildAtom<HostNode, HostElement>
//   > { }
// printLabel([[{ _isVNode: true, props: {}, anchor: 23, target: 'adsfasd' }], []]);
// 通过或操作也可以循环创建多维数组vnode


// Readonly源码：
// type Readonly<T> = {
//   readonly [P in keyof T]: T[P];
// };
// interface Person {
//   name: string;
//   age?: number;
// }
// type person4 = Readonly<Person>;
// // person4 === {
// //        readonly name: string;
// //        readonly age?: number;
// //  }



// type Slot = (...args: any[]) => boolean;
// const normalizeSlot = (key: number, rawSlot: Function): Slot => (
//   props: any
// ) => {
//   return false;
// }
// const a = normalizeSlot(333, function () { }); // 根据定义a方法只要理解我接受多个任
// 意参数且返回布尔值的函数就行
// alert(a());  //false


// let slots: string | void;
// slots = undefined;
// slots = "fadf";

// undefined 在 ES5 中已经是全局对象的一个只读（read - only）属性了，它不能被重写。但是在局部作用
// 域中，还是可以被重写的
// void 运算符能对给定的表达式进行求值，然后返回 undefined。也就是说，void 后面你随便跟上一个表达式
// 返回的都是 undefined，如 void (2), void (‘hello’) 。并且void是不能被重写的。但为什么
// 是void 0 呢，void 0 是表达式中最短的。用 void 0 代替 undefined 能节省字节。不少 JavaScript压
// 缩工具在压缩过程中，正是将 undefined 用 void 0 代替掉了



// 函数类型各种泛型接口
// export interface SetupContext {
//   attrs: string
// }
// export type ComponentPropsOptions<P> =
//   | string[]
// export interface FunctionalComponent<P = {}> {  //注意这里是个实力化对象不是类型，写类型就代表默认类型
//   (props: P, ctx: SetupContext): number   //这里是在指定函数两个参数，且类型是啥，返回值是啥
//   props?: ComponentPropsOptions<P>
//   displayName?: string
// }
// const test1: FunctionalComponent<number> = function (value, valu) {
//   return 3
// };
// test1(23, { attrs: "dfd" });
// test1.props = [];
// const test2: FunctionalComponent = function (value, value2) {
//   return 3;
// }
// test2(34, { attrs: "dfd" });
// interface ConfigFn<T = number> {  //默认number类型
//   (value: T): T;
// }
// function getData<T>(value: T): T {
//   return value;
// }
// var myGetData: ConfigFn<object> = getData;
// var myGetData2: ConfigFn = getData;  //没写就用原来默认的number类型
// myGetData({});  //传入新的默认类型
// myGetData2(23);
// interface ConfigFnTwo {
//   <T>(value: T): T;
// }
// var testGetData: ConfigFnTwo = function <T>(value: T): T {
//   return value;
// };
// // 这种就是在调用时候传入类型，也不以不传
// testGetData<string>('fdf'); 




// 联合类型表示一个值可以是几种类型之一。 我们用竖线（ |）分隔每个类型，所以number | string | boolean
// 表示一个值可以是number，string，或boolean
// 如果一个值是联合类型，我们只能访问此联合类型的所有类型里共有的成员
// interface Bird {
//   fly();
//   layEggs();
// }
// interface Fish {
//   swim();
//   layEggs();
// }
// function getSmallPet(): Fish | Bird {
//   // ...
// }
// let pet = getSmallPet();
// pet.layEggs(); // okay
// pet.swim();    // errors





// 交叉类型是将多个类型合并为一个类型。 这让我们可以把现有的多种类型叠加到一起成为一种类型，它包含了所需
// 的所有类型的特性。 例如， Person & Serializable & Loggable同时是Person和Serializable和
// Loggable。 就是说这个类型的对象同时拥有了这三种类型的成员。
// 我们大多是在混入（mixins）或其它不适合典型面向对象模型的地方看到交叉类型的使用。 （在JavaScript里
// 发生这种情况的场合很多！） 下面是如何创建混入的一个简单例子：
// function extend<T, U>(first: T, second: U): T & U {
//   let result = <T & U>{};
//   for (let id in first) {
//     (<any>result)[id] = (<any>first)[id];
//   }
//   for (let id in second) {
//     if (!result.hasOwnProperty(id)) {
//       (<any>result)[id] = (<any>second)[id];
//     }
//   }
//   return result;
// }
// class Person {
//   constructor(public name: string) { }
// }
// interface Loggable {
//   log(): void;
// }
// class ConsoleLogger implements Loggable {
//   log() {
//     // ...
//   }
// }
// var jim = extend(new Person("Jim"), new ConsoleLogger());
// var n = jim.name;
// jim.log();





// 接口之间相互继承，属性名可以重复，但是类型必须一致
// interface A {
//   name: string
// }
// interface B {
//   age: number
// }
// // 接口可以继承多个其他接口
// // B可以有与A属性名一样的属性名，但类型必须相同，否则C同时继承A、B会报错
// interface C extends A, B {
//   sex: number
// }
// let c1: C = {
//   name: 'abc',
//   sex: 0,
//   age: 10
// }
// 泛型内部的extends是用来做泛型约束的




// type petsGroup = string;
// interface IPetInfo {
//   name: string,
//   age: number,
// }
// type IPets = Record<petsGroup, IPetInfo>;
// const animalsInfo: IPets = {
//   23: {
//     name: 'dogName',
//     age: 2
//   },
//   cat: {
//     name: 'catName',
//     age: 3
//   },
//   fish: {
//     name: 'fishName',
//     age: 5
//   },
//   otherAnamial: {
//     name: 'otherAnamialName',
//     age: 10
//   }
// }


// function getData<T>(value:T):T{
//   return value;
// }
// getData<number>(123);
// getData<string>('1214231');



// 返回一个函数的写法：
// function injectHook() {
//   return 23;
// }
// const createHook = <T extends Function = () => any>(
//   lifecycle: string
// ) => (hook: T) => injectHook()
// const onBeforeMount = createHook('fadfa')
// onBeforeMount(function () { })





// // https://github.com/Microsoft/TypeScript/blob/master/src/compiler/types.ts#L3859
// export const enum ObjectFlags {
//   Class = 1 << 0,  // Class
//   Interface = 1 << 1,  // Interface
//   Reference = 1 << 2,  // Generic type reference
//   Tuple = 1 << 3,  // Synthesized generic tuple type
//   Anonymous = 1 << 4,  // Anonymous
//   Mapped = 1 << 5,  // Mapped
//   Instantiated = 1 << 6,  // Instantiated anonymous or mapped type
//   ObjectLiteral = 1 << 7,  // Originates in an object literal
//   EvolvingArray = 1 << 8,  // Evolving array type
//   ObjectLiteralPatternWithComputedProperties = 1 << 9,  // Object literal pattern with computed properties
//   ContainsSpread = 1 << 10, // Object literal contains spread operation
//   ReverseMapped = 1 << 11, // Object contains a property from a reverse-mapped type
//   JsxAttributes = 1 << 12, // Jsx attributes type
//   MarkerType = 1 << 13, // Marker type used for variance probing
//   JSLiteral = 1 << 14, // Object type declared in JS - disables errors on read/write of nonexisting members
//   ClassOrInterface = Class | Interface
// }





// 自从 TypeScript 2.1 版本推出映射类型以来，它便不断被完善与增强。在 2.1 版本中，可以通过 keyof 拿
// 到对象 key 类型， 内置 Partial、Readonly、Record、Pick 映射类型；2.3 版本增加ThisType；
// 2.8 版本增加 Exclude、Extract、NonNullable、ReturnType、InstanceType；同时在此版本中增加条
// 件类型与增强 keyof 的能力；3.1 版本支持对元组与数组的映射。这些无不意味着映射类型在 TypeScript有
// 着举足轻重的地位。其中 ThisType 并没有出现在官方文档中，它主要用来在对象字面量中键入 this：
// type ObjectDescriptor<D, M> = {
//   data?: D;
//   methods?: M & ThisType<D & M>;  // Type of 'this' in methods is D & M
// }
// function makeObject<D, M>(desc: ObjectDescriptor<D, M>): D & M {
//   let data: object = desc.data || {};
//   let methods: object = desc.methods || {};
//   return { ...data, ...methods } as D & M;
// }
// let obj = makeObject({
//   data: { x: 0, y: 0 },
//   methods: {
//     moveBy(dx: number, dy: number) {
//       this.x += dx;  // 这里就可以反问到data里面的值了
//       this.y += dy;  // Strongly typed this
//     }
//   }
// });
// obj.x = 10;
// obj.y = 20;
// obj.moveBy(5, 5);
// alert(obj.x);  //15




// ts中函数使用this得先声明以及bind方法使用
// const target = {
//   name: 4,
// }
// function instanceWatch(
//   this: object,
//   source: string | Function,
// ): string {
//   console.log(this);
//   console.log(source);
//   return "fasd";
// }
// const test = instanceWatch.bind(target);
// test('fadsf');


// 安全导航操作符( ?.) 和空属性路径为了解决导航时变量值为null时，页面运行时出错的问题。
// The null hero's name is {{nullHero?.name}}
// 非空断言操作符能确定变量值一定不为空时使用。与安全导航操作符不同的是，非空断言操作符不会防
// 止出现 null 或 undefined。 它只是告诉 TypeScript 的类型检查器对特定的属性表达式，不
// 做 "严格空值检测"
// this.listeners.get(type)!.size > 0






// infer 最早出现在此 PR 中，表示在 extends 条件语句中待推断的类型变量
// type ParamType<T> = T extends (param: infer P) => any ? P : T;
// 在这个条件语句 T extends (param: infer P) => any ? P : T 中，infer P 表示待推断的函数参数
// 整句表示为：如果 T 能赋值给(param: infer P) => any，则结果是(param: infer P) => any 类型
// 中的参数 P，否则返回为 T
// interface User {
//   name: string;
//   age: number;
// }
// type Func = (user: User) => void
// type Param = ParamType<Func>;   // Param = User
// type AA = ParamType<string>;    // string








// enum AnimalFlags {
//   None = 0,
//   HasClaws = 1 << 0,
//   CanFly = 1 << 1,
//   HasClawsOrCanFly = HasClaws | CanFly
// }
// interface Animal {
//   flags: AnimalFlags;
//   [key: string]: any;
// }
// function printAnimalAbilities(animal: Animal) {
//   var animalFlags = animal.flags;
//   if (animalFlags & AnimalFlags.HasClaws) {
//     console.log('animal has claws');
//   }
//   if (animalFlags & AnimalFlags.CanFly) {
//     console.log('animal can fly');
//   }
//   if (animalFlags == AnimalFlags.None) {
//     console.log('nothing');
//   }
// }
// var animal = { flags: AnimalFlags.None };
// printAnimalAbilities(animal); // nothing
// animal.flags |= AnimalFlags.HasClaws;
// printAnimalAbilities(animal); // animal has claws
// animal.flags &= ~AnimalFlags.HasClaws;
// printAnimalAbilities(animal); // nothing
// animal.flags |= AnimalFlags.HasClaws | AnimalFlags.CanFly;
// printAnimalAbilities(animal); // animal has claws, animal can fly
// 上例代码中 |= 用来添加一个标志，&= 和 ~ 用来删除标志，| 用来合并标志





// type Partial<T> = {
//   [P in keyof T]?: T[P];
// };

// type Pick<T, K extends keyof T> = {
//   [P in K]: T[P];
// };

// interface User {
//   id: number;
//   age: number;
//   name: string;
// };
// // 相当于: type PartialUser = { id?: number; age?: number; name?: string; }
// type PartialUser = Partial<User>
// // 相当于: type PickUser = { id: number; age: number; }
// type PickUser = Pick<User, "id" | "age">
// interface Point {
//   x: number;
//   y: number;
// }
// // type keys = "x" | "y"
// type keys = keyof Point;
// 假设有一个 object 如下所示，我们需要使用 typescript 实现一个 get 函数来获取它的属性值:
// const data = {
//   a: 3,
//   hello: 'world'
// }
// function get(o: object, name: string) {
//   return o[name]
// }
// 我们刚开始可能会这么写，不过它有很多缺点
//     无法确认返回类型：这将损失 ts 最大的类型校验功能
//     无法对 key 做约束：可能会犯拼写错误的问题
// 这时可以使用 keyof 来加强 get 函数的类型功能，有兴趣的同学可以看看 _.get 的 type 标记以及实现
// function get<T extends object, K extends keyof T>(o: T, name: K): T[K] {
//   return o[name]
// }






// 虽已内置了很多映射类型，但在很多时候，我们需要根据自己的项目自定义映射类型：
// 比如你可能想取出接口类型中的函数类型：
// type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
// type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;
// interface Part {
//   id: number;
//   name: string;
//   subparts: Part[];
//   updatePart(newName: string): void;
// }
// type test = FunctionPropertyNames<string>; 这里必须要传值，除非上面定义时候设置了T = any有个默认值
// type T40 = FunctionPropertyNames<Part>;  // "updatePart"
// type T42 = FunctionProperties<Part>;     // { updatePart(newName: string): void }
// const a: T40 = "updatePart";
// const b: T42 = {
//   updatePart: function () { }
// };
// type MapSources<T> = {
//   [K in keyof T]: T[K] extends Function ? K : never
// }
// type tttt = MapSources<string>    那么tttt就是string类型
// type test = MapSources<Part>  这里test实际上就是：
//                 type test = {
//                   id: never;
//                   name: never;
//                   subparts: never;
//                   updatePart: "updatePart";
//                 }
// 此时也无法给test类型赋值了，因为没有类型可以转换为never类型, 如果加了[keyof T]就同最上面一样了







// 源码大概类似type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
// interface User {
//   id: number;
//   age: number;
//   name: string;
// };
// // 相当于: type PickUser = { age: number; name: string; }
// type OmitUser = Omit<User, "id">






// 类型别名与接口有些类似，都支持类型参数，且可以引用自身，例如：
// type Tree<T> = {
//   value: T;
//   left: Tree<T>;
//   right: Tree<T>;
// }
// interface ITree<T> {
//   value: T;
//   left: ITree<T>;
//   right: ITree<T>;
// }
// 但存在一些本质差异：
//   类型别名并不会创建新类型，而接口会定义一个新类型
//   允许给任意类型起别名，但无法给任意类型定义与之等价的接口（比如基础类型）
//   无法继承或实现类型别名（也不能扩展或实现其它类型），但接口可以
//   类型别名能将多个类型组合成一个具名类型，而接口无法描述这种组合（交叉、联合等）
// // 类型组合，接口无法表达这种类型
// type LinkedList<T> = T & { next: LinkedList<T> };
// interface Person {
//   name: string;
// }
// function findSomeone(people: LinkedList<Person>, name: string) {
//   people.name;
//   people.next.name;
//   people.next.next.name;
//   people.next.next.next.name;
// }
// 应用场景上，二者区别如下：
//   接口：OOP场景（因为能被继承和实现，维持着类型层级关系）
//   类型别名：追求可读性的场景、接口无法描述的场景（基础类型、交叉类型、联合类型等）













