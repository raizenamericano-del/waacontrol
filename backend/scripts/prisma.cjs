const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const backendDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(backendDir, '..');
for (const envPath of [path.join(repoDir, '.env'), path.join(backendDir, '.env')]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
}

const provider = (process.env.DB_PROVIDER || 'sqlite').toLowerCase();
const schemaName = provider === 'postgresql' || provider === 'postgres'
  ? 'schema.postgresql.prisma'
  : 'schema.sqlite.prisma';
const schemaPath = path.join(backendDir, 'prisma', schemaName);
const prismaCli = path.join(repoDir, 'node_modules', 'prisma', 'build', 'index.js');

if (!fs.existsSync(prismaCli)) {
  console.error('Prisma CLI belum terpasang. Jalankan npm install dari root project.');
  process.exit(1);
}
if (!fs.existsSync(schemaPath)) {
  console.error(`Schema Prisma tidak ditemukan: ${schemaPath}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Gunakan: node scripts/prisma.cjs <generate|db push|...>');
  process.exit(1);
}

console.log(`[prisma] provider=${provider}; schema=${schemaName}`);
const result = spawnSync(process.execPath, [prismaCli, ...args, '--schema', schemaPath], {
  cwd: repoDir,
  env: process.env,
  stdio: 'inherit'
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
