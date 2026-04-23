import { materialXNodeRegistry } from '@material-viewer/materialx';
import { defineCommand } from 'yargs-file-commands';

export const command = defineCommand({
  command: 'list',
  describe: 'List all known MaterialX node categories',
  builder: (yargs) => yargs,
  handler: async () => {
    const categories = [...new Set(materialXNodeRegistry.map((entry) => entry.category))].toSorted();
    for (const category of categories) {
      console.log(category);
    }
  },
});
