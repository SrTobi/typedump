
"$tmpl-file:esprima.js"
"$tmpl-file:escodegen.js"


var nextId = 1
const objectToId = new Map()
const refToGlobalObject = global

function makeSnapshot(obj) {
    var idToEntry = new Map()
    
    function record(obj) {
        if (obj === null) {
            return {
                type: "null"
            }
        }
        
        switch (typeof obj) {
            case "string":
            case "number":
            case "boolean":
            return {
                type: typeof obj,
                value: obj
            }
            case "undefined":
            return {
                type: "undefined"
            }
            default:
        }
        
        let id = objectToId.get(obj)
        if (id === undefined) {
            id = nextId++
            objectToId.set(obj, id)
        }
        
        if (!idToEntry.has(id)) {
            const entry = { id: id }
            idToEntry.set(id, entry)
            
            if (typeof obj === "symbol") {
                entry.type = "symbol"
                entry.toString = obj.toString()
            } else {
                entry.type = typeof obj
                const props = []
                entry.prototype = record(Object.getPrototypeOf(obj))
                entry.properties = props
                for (const prop of Object.getOwnPropertyNames(obj)) {

                    if (refToGlobalObject === obj && prop === "_typedump_makeSnapshot")
                        continue

                    const desc = Object.getOwnPropertyDescriptor(obj, prop)
                    if (desc["value"] !== undefined) {
                        props.push({
                            name: prop,
                            value: record(desc.value),
                            writable: desc.writable,
                            configurable: desc.configurable,
                            enumerable: desc.enumerable
                        })
                    } else {
                        props.push({
                            name: prop,
                            "get": record(desc.get),
                            "set": record(desc.set),
                            configurable: desc.configurable,
                            enumerable: desc.enumerable
                        })
                    }
                }
            }
        }
        
        return {
            type: "ref",
            target: id
        }
    }
    
    var objEntry = record(obj)
    
    return [objEntry, idToEntry]
}


global._typedump_makeSnapshot = makeSnapshot

const [globalId, globalSnapshotBefore] = makeSnapshot(refToGlobalObject)

const moduleExports = require("$tmpl-var:entry")

const [,globalSnapshotAfter] = makeSnapshot(refToGlobalObject)

const [exportId, exportSnapshot] = makeSnapshot(moduleExports);

const result = {
    globalSnapshotBefore: [...globalSnapshotBefore],
    globalSnapshotAfter: [...globalSnapshotAfter],
    exportId: exportId,
    exportSnapshot: [...exportSnapshot]
}

var fs = require("fs")
fs.writeFileSync("$tmpl-var:snapshot-dst", JSON.stringify(result), { encoding: 'utf-8' })