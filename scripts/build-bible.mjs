// Готовит текст Синодального перевода для приложения.
//
//   npm run bible:build                     # скачать файл по адресу по умолчанию
//   npm run bible:build -- --file rus.xml   # взять уже скачанный файл
//   npm run bible:build -- --url https://…  # другой адрес (Zefania XML)
//
// Результат: public/bible/rst/index.json и по файлу на книгу (gen.json, exo.json, …).
// Папку нужно добавить в репозиторий: при сборке на хостинге скрипт не запускается.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { buildOutput, parseZefania } from './zefania.mjs'

const DEFAULT_URL = 'https://raw.githubusercontent.com/seven1m/open-bibles/master/rus-synodal.zefania.xml'
const OUT_DIR = new URL('../public/bible/rst/', import.meta.url)
const books = JSON.parse(readFileSync(new URL('../src/bible/books.json', import.meta.url), 'utf8'))

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function loadXml() {
  const file = arg('file')
  if (file) {
    console.log(`Читаю файл ${file}`)
    return { xml: readFileSync(file, 'utf8'), source: file }
  }
  const url = arg('url') ?? DEFAULT_URL
  console.log(`Скачиваю ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Не удалось скачать файл: HTTP ${res.status}. Скачайте его вручную и запустите с --file.`)
  return { xml: await res.text(), source: url }
}

const { xml, source } = await loadXml()
const parsed = parseZefania(xml)
console.log(`В файле книг: ${parsed.length}`)

const result = buildOutput(parsed, books, { translation: 'rst', name: 'Синодальный перевод', source })
console.log('\n' + result.report)

if (result.fixes.length) {
  console.log('\nПрименённые правки источника:')
  for (const f of result.fixes) console.log('  - ' + f)
}

if (result.warnings.length) {
  console.log(`\nПредупреждения (${result.warnings.length}):`)
  for (const w of result.warnings.slice(0, 60)) console.log('  - ' + w)
  if (result.warnings.length > 60) console.log(`  … и ещё ${result.warnings.length - 60}`)
}
if (result.errors.length) {
  console.error(`\nОшибки (${result.errors.length}):`)
  for (const e of result.errors) console.error('  - ' + e)
  console.error('\nФайлы не записаны.')
  process.exit(1)
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
for (const [id, chapters] of Object.entries(result.files)) {
  writeFileSync(new URL(`${id}.json`, OUT_DIR), JSON.stringify(chapters))
}
writeFileSync(new URL('index.json', OUT_DIR), JSON.stringify(result.index))
console.log(`\nГотово: ${books.length} книг записано в public/bible/rst/`)
