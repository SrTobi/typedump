import * as Path from 'path'
import * as Clime from 'clime'
import * as fs from 'fs'
import * as ChildProc from 'child_process'
//import * as inspector from 'inspector'
import * as blub from 'vscode-chrome-debug-core'

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
            default: ".",
            description: "The target module or file"
        })
        target: string,

        ops: Options
    ) {
        target = Path.resolve(target)
        console.log(`Execute '${target}'...`)

        let port = 8934

        const node = ChildProc.spawn("node", ["--inspect-brk="+port, target])
        
        node.stderr.on('data', (data) => { console.log((data as Buffer).toLocaleString().split("\n").map(s => "DBG " + s).join("\n"))})
        node.stdout.on('data', (data) => { console.log((data as Buffer).toLocaleString().split("\n").map(s => "OUT " + s).join("\n"))})
        node.on("close", (code) => {
            if (code) {
                console.log("Exited with error:", code)
            }else {
                console.log("Exited ok!")
            }
        });


        console.log("try to connect!")
        const connect = new blub.chromeConnection.ChromeConnection();
        await connect.attach("localhost", port)

        console.log("connected!")

        const getNamedVariablesFn = `
            function getNamedVariablesFn() {
                var result = [];
                var ownProps = Object.getOwnPropertyNames(this);
                for (var prop of ownProps) result[i] = prop;
                return result;
            }`

        const getIndexedVariablesFn = `
            function getNamedVariablesFn() {
                var result = [];
                var ownProps = Object.getOwnPropertyNames(this);
                for (var prop of ownProps) result[i] = prop;
                return result;
            }`

        connect.api.Debugger.onPaused!(async (e) => {
            if (e.callFrames[0].functionName !== "tryModuleLoad") {
                connect.api.Debugger.stepOut!()
            }else {
                console.log("reached!")

                /*const res = await connect.api.Runtime.callFunctionOn!({
                    functionDeclaration: getNamedVariablesFn,
                    objectId: 
                })*/

                let res = await connect.api.Runtime.getProperties!({objectId: e.callFrames[0].scopeChain[0].object.objectId!})
                console.log(res)
                res = await connect.api.Runtime.getProperties!({objectId: res.result[0].value!.objectId!})
                console.log(res)
                connect.api.Debugger.resume!()
            }
        });
        
        connect.api.Runtime.onExecutionContextDestroyed((p) => {
            if (p.executionContextId == 1) {
                connect.close();
                //connect.api.HeapProfiler.takeHeapSnapshot!({reportProgress: true});
            }
        })

        /*connect.api.HeapProfiler.onAddHeapSnapshotChunk((e) => {
            console.log("new snapshot chunk ", e.chunk.length)
            fdest.write(e.chunk);
            if (e.chunk[e.chunk.length-1] == "}") {
                console.log("end!");
            }
        })
        connect.api.HeapProfiler.onReportHeapSnapshotProgress(e => {
            console.log("Heap taken", e.total)
        });*/

        console.log("check enabled!")
        //await connect.api.Console.enable!();
        await [
            connect.api.Console.enable!()
                .catch(e => { /* Specifically ignore a fail here since it's only for backcompat */ }),
            connect.api.Debugger.enable!(),
            connect.api.Runtime.enable!(),
            connect.api.HeapProfiler.enable!(),
            connect.run!()
        ];

        console.log("enalbed!");

        //await connect.api.Debugger.resume!();
        //console.log("resumed!");

        
    }
}