import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');
const staticSource = join(root, '.next', 'static');

if (!existsSync(standalone) || !existsSync(staticSource)) {
  throw new Error('Next.js standalone or static output is missing');
}

const staticTarget = join(standalone, '.next', 'static');
mkdirSync(staticTarget, { recursive: true });
cpSync(staticSource, staticTarget, { recursive: true });

const publicSource = join(root, 'public');
if (existsSync(publicSource)) {
  cpSync(publicSource, join(standalone, 'public'), { recursive: true });
}

console.log('Standalone package includes static assets');
