import { materialXNodeRegistry, readMaterialX, validateDocument } from '@material-viewer/materialx';
import { defineCommand } from 'yargs-file-commands';

export const command = defineCommand({
  command: 'validate <input>',
  describe: 'Validate a MaterialX file against known node categories',
  builder: (yargs) =>
    yargs.positional('input', {
      describe: 'Path to .mtlx file',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    let issues: ReturnType<typeof validateDocument> = [];
    try {
      const document = await readMaterialX(argv.input);
      issues = validateDocument(document, materialXNodeRegistry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR materialx/${argv.input}: ${message}`);
      process.exitCode = 1;
      return;
    }

    if (issues.length === 0) {
      console.log('Validation passed.');
      return;
    }

    for (const issue of issues) {
      const line = `${issue.level.toUpperCase()} ${issue.location}: ${issue.message}`;
      if (issue.level === 'error') {
        console.error(line);
      } else {
        console.log(line);
      }
    }

    if (issues.some((issue) => issue.level === 'error')) {
      process.exit(1);
    }
  },
});
