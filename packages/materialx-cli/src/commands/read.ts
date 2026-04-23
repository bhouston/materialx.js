import { readMaterialX } from '@material-viewer/materialx';
import { defineCommand } from 'yargs-file-commands';

export const command = defineCommand({
  command: 'read <input>',
  describe: 'Read a MaterialX file and print document stats',
  builder: (yargs) =>
    yargs.positional('input', {
      describe: 'Path to .mtlx file',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    const document = await readMaterialX(argv.input);
    const payload = {
      attributes: document.attributes,
      topLevelNodes: document.nodes.length,
      nodeGraphs: document.nodeGraphs.length,
      nodeCategories: [...new Set(document.nodes.map((node) => node.category))].toSorted(),
    };
    console.log(JSON.stringify(payload, null, 2));
  },
});
