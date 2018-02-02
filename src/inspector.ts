import { chromeConnection, Crdp } from 'vscode-chrome-debug-core'

export interface AnyNode {
//    id: Crdp.Runtime.RemoteObjectId
}

export interface PrimitiveNode<TypeName, Type> extends AnyNode {
    type: TypeName
    value: Type
}

export interface UndefinedNode extends AnyNode {
    type: "undefined"
}

export interface NullNode extends AnyNode {
    type: "null"
}

export interface PropertyDescription {
    name: string
    configurable: boolean
    enumerable: boolean

    isValueProperty(): this is ValuePropertyDescription
}

export class ValuePropertyDescription implements PropertyDescription {
    public constructor(
        public readonly name: string,
        public readonly symbol: SymbolNode | undefined,
        public readonly configurable: boolean,
        public readonly enumerable: boolean,
        public readonly value: Node,
        public readonly writable: boolean) {
    }

    isValueProperty() {
        return true
    }
}

export class MutatorPropertyDescription implements PropertyDescription {
    public constructor(
        public readonly name: string,
        public readonly symbol: SymbolNode | undefined,
        public readonly configurable: boolean,
        public readonly enumerable: boolean/*,
        public readonly get: Node,
        public readonly set: boolean*/) {
    }

    isValueProperty() {
        return false
    }
}

export interface ObjectNode extends AnyNode {
    type: "object"
    subypeHint?: ('array' | 'node' | 'regexp' | 'date' | 'map' | 'set' | 'weakmap' | 'weakset' | 'iterator' | 'generator' | 'error' | 'proxy' | 'promise' | 'typedarray')
    className: string
    properties: PropertyDescription[]
}

export type BooleanNode = PrimitiveNode<"boolean", boolean>
export type NumberNode = PrimitiveNode<"number", number>
export type StringNode = PrimitiveNode<"string", string>
export type SymbolNode = PrimitiveNode<"symbol", string>

export type Node = UndefinedNode | BooleanNode | NumberNode | StringNode | SymbolNode | NullNode | ObjectNode
export type NodeType = Node["type"]

let nextId = 1

async function seqMap<From, To>(arr: From[], f: (e: From) => Promise<To>): Promise<To[]> {
    const result: To[] = []
    for (const e of arr) {
        result.push(await f(e));
    }
    return result
}

export class Inspector {
    private constructor(private readonly connection: chromeConnection.ChromeConnection) {
        this.runtime.onExecutionContextDestroyed((e) => {
            if (e.executionContextId == 1) {
                this.connection.close()
            }
        })
    }

    public static async create(port: number) {
        const con = new chromeConnection.ChromeConnection()
        await con.attach(undefined, port);


        await [
            con.api.Console.enable!()
                .catch(e => { /* Specifically ignore a fail here since it's only for backcompat */ }),
            con.api.Debugger.enable!(),
            con.api.Runtime.enable!(),
            con.run!()
        ];

        return new Inspector(con)
    }

    public async getAllObjects(objs: Crdp.Runtime.RemoteObject[]): Promise<Node[]> {

        const objMap = new Map<number, Node>()
        //const classNames = new Set<string>()

        var transformProperty = async (desc: Crdp.Runtime.PropertyDescriptor): Promise<PropertyDescription> => {
            //console.log("->", desc.name)
            const sym = desc.symbol? <SymbolNode>await transformObject(desc.symbol): undefined
            if (sym && sym.type !== "symbol") {
                throw "expected symbol"
            }
            if (desc.value) {
                return new ValuePropertyDescription(
                    desc.name,
                    sym,
                    !!desc.configurable,
                    !!desc.enumerable,
                    await transformObject(desc.value!),
                    !!desc.writable
                )
            } else {
                return new MutatorPropertyDescription(
                    desc.name,
                    sym,
                    !!desc.configurable,
                    !!desc.enumerable
                )
            }
        }

        var transformObject = async (remoteObj: Crdp.Runtime.RemoteObject): Promise<Node> => {
            const id = remoteObj.objectId

            //console.log(remoteObj.className)

            /*if(objMap.size == 100) {
                const r = await this.runtime.getProperties!({objectId: objs[0].objectId! ,ownProperties: true, generatePreview: false}).then(response => response.result)
                console.log(JSON.stringify(r, undefined, "  "))
                process.exit(1);
            }*/

            //console.log(id)

            function makeNode<N, Type extends NodeType>(type: Type, rest: N): N & { type: Type } {
                return Object.assign({id, type}, rest)
            }

            switch (remoteObj.type) {
                case "undefined": return makeNode("undefined", {})
                case "boolean": return makeNode("boolean", {value: remoteObj.value})
                case "number": return makeNode("number", {value: remoteObj.value})
                case "string": return makeNode("string", {value: remoteObj.value})
                case "symbol": return makeNode("symbol", {value: remoteObj.value})
                case "object": {
                    if (remoteObj.subtype == "null") {
                        return makeNode("null", {})
                    } else {
                        const descriptors = await this.runtime.getProperties!({objectId: id!,ownProperties: true, generatePreview: false})
                                                    .then(response => response.result)

                        const seenId = descriptors.find(d => d.name === "___seen")

                        if(seenId !== undefined) {
                            if(seenId.value!.type !== "number") {
                                throw "no number?"
                            }
                            const alr= objMap.get((seenId as any).value!.value as number)!
                            if(!alr) {
                                throw "noooooo[" + JSON.stringify(seenId) + "]"
                            }
                            return alr
                        }

                        const newId = ++nextId

                        const func = `
                            function(id) {
                                this.___seen = id;
                            }
                        `
                        this.runtime.callFunctionOn!({functionDeclaration: func, objectId: id, arguments: [{ value: newId}], awaitPromise: true})
                                                

                        const node = makeNode("object", {
                            subtypeHint: remoteObj.subtype as any,
                            className: remoteObj.className!,
                            properties: [] as PropertyDescription[]
                        })

                        objMap.set(newId, node)

                        node.properties = await seqMap(descriptors, transformProperty)
                        return node
                    }
                }
                case "function": return "a function" as any//return makeNode("string", {value: "a function!"})
            }
        }

        return Promise.all(objs.map(obj => transformObject(obj)));
    }

    public get api() {
        return this.connection.api
    }

    public get debugger() {
        return this.api.Debugger
    }

    public get runtime() {
        return this.api.Runtime
    }
}