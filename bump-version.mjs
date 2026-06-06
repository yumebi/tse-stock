import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));

const confPath = resolve(dir, 'src-tauri/tauri.conf.json');
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
const [maj, min, patch] = conf.version.split('.').map(Number);
conf.version = `${maj}.${min}.${patch + 1}`;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

const cargoPath = resolve(dir, 'src-tauri/Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = "[\d.]+"/m, `version = "${conf.version}"`);
writeFileSync(cargoPath, cargo);

console.log(`バージョンを ${conf.version} に更新`);
