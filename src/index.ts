import * as Path from 'path'
import * as clime from 'clime'


const cli = new clime.CLI("typedump-cli", Path.join(__dirname, 'commands'))

let shim = new clime.Shim(cli);
shim.execute(process.argv);