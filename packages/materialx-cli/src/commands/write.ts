import { readMaterialX, writeMaterialX } from '@materialx-js/materialx';
import { defineCommand } from 'yargs-file-commands';

export const command = defineCommand({
  command: 'write <input> <output>',
  describe: 'Read and write a normalized MaterialX file',
  builder: (yargs) =>
    yargs
      .positional('input', {
        describe: 'Input .mtlx file path',
        type: 'string',
        demandOption: true,
      })
      .positional('output', {
        describe: 'Output .mtlx file path',
        type: 'string',
        demandOption: true,
      }),
  handler: async (argv) => {
    const document = await readMaterialX(argv.input);
    await writeMaterialX(argv.output, document);
    console.log(`Wrote ${argv.output}`);
  },
});
