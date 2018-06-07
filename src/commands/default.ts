import * as Path from 'path'
import * as Clime from 'clime'
import * as ChildProc from 'child_process'
import * as utils from '../utils'


const root = Path.normalize(`${__dirname}/../..`)

const mainTmplPath = `${root}/tmpl/main.js`

async function tmpl_replace(source: string, path: string, vars: { [name: string]: string }): Promise<string> {
    let match: RegExpExecArray | null
    {
        const regex = /"\$tmpl-file:([^"]+)"/g
        const replFiles: string[] = []
        while (match = regex.exec(source)) {
            replFiles.push(match[1])
        }

        for (const f of replFiles) {
            const file = `${path}/${f}`
            console.log(`- Inject ${file}`)
            source = source.replace(`\"$tmpl-file:${f}"`, await utils.readFile(file))
        }
    }

    {
        const regex = /"\$tmpl-var:([^"]+)"/g
        const replVars: string[] = []
        while (match = regex.exec(source)) {
            replVars.push(match[1])
        }

        for (const v of replVars) {
            if (!vars[v]) {
                throw new Error(`Unknown variable ${v}`)
            }
            source = source.replace(`\"$tmpl-var:${v}"`, `\"${vars[v]}\"`)
        }
    }


    return source
}


/*
function progargs(): StringCastable<string[]> {
    return {
        async cast(str: string, context: CastingContext<string[]>): Promise<string[]> {
            // https://stackoverflow.com/a/29656458/1393971
            let parts = str.match(/"[^"]+"|'[^']+'|\S+/g)
            if (!parts) {
                throw new ExpectedError("Parameter are invalid");
            }
            return parts
        }
    }
}*/
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Options extends Clime.Options {
    @Clime.option({
        flag: 'p',
        description: "parameter for the target module",
    })
    parameter?: string
}

@Clime.command({
    description: "Executes the specified node module and dump the resulting state."
})
export default class extends Clime.Command {
    async execute(
        @Clime.param({
            default: "blub.js",
            description: "The target module or file"
        })
        target: string,

        ops: Options
    ) {
        target = Path.resolve(target)
        console.log(`Analyse '${target}'...`)
        const targetJs = require.resolve(target)
        console.log(`Entry:  '${targetJs}'`)
        
        console.log("Load template file...")
        const mainTmpl = await utils.readFile(mainTmplPath)
        console.log(` => Success (${mainTmpl.length} characters read)`)

        // transform main source
        console.log("Build entry file...")
        const constants = {
            'entry': targetJs,
            'snapshot-dst': Path.resolve("./snapshot.json")
        }
        const entrySource = await tmpl_replace(mainTmpl, `${root}/tmpl`, constants)

        const entryJs = `_${Path.basename(target)}.entry.js`
        console.log(`Write entry file to ${entryJs}...`)
        await utils.writeFile(entryJs, entrySource)
        console.log(` => Success (${entrySource.length} characters written)`)
        
        try {
            console.log(`Run entry...`)

            const node = ChildProc.spawn("node", [entryJs])
            
            node.stderr.on('data', (data) => { console.log((data as Buffer).toLocaleString().split("\n").map(s => "DBG " + s).join("\n"))})
            node.stdout.on('data', (data) => { console.log((data as Buffer).toLocaleString().split("\n").map(s => "OUT " + s).join("\n"))})
            await new Promise<void>((resolve, reject) => {
                node.on("close", (err) => {
                    if (err) {
                        reject(err)
                    }else {
                        resolve()
                    }
                })
            })
        } catch (err) {
            console.error("Failed to execute target:", err)
        } finally {
            console.log("Remove entry file...")
            //await utils.deleteFile(entryJs)
            console.log(" => Success")
        }
    }
}