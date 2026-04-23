import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materialXNodeRegistry } from '@material-viewer/materialx';
import { supportedNodeCategories } from '../mapping/mx-node-map.js';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.resolve(sourceDir, '../../SUPPORTED_NODES.md');

const allCategories = [...new Set(materialXNodeRegistry.map((entry) => entry.category))].toSorted();
const supported = allCategories.filter((entry) => supportedNodeCategories.has(entry));
const unsupported = allCategories.filter((entry) => !supportedNodeCategories.has(entry));

const toBullets = (entries: string[]): string =>
  entries.length === 0 ? '- (none)\n' : `${entries.map((entry) => `- \`${entry}\``).join('\n')}\n`;

const markdown = `# materialx-three Node Coverage

Generated from \`@material-viewer/materialx\` node registry.

## Summary

- Total categories in registry: ${allCategories.length}
- Supported categories: ${supported.length}
- Unsupported categories: ${unsupported.length}

## Supported

${toBullets(supported)}
## Unsupported

${toBullets(unsupported)}
`;

await writeFile(reportPath, markdown, 'utf8');
console.log(`Wrote node coverage report to ${reportPath}`);
