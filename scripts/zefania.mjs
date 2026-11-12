// Разбор Библии в формате Zefania XML и подготовка файлов для приложения.
// Чистые функции без обращения к сети и диску, чтобы их можно было тестировать.

const ATTR_RE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function attrs(source) {
  const result = {}
  for (const m of source.matchAll(ATTR_RE)) result[m[1].toLowerCase()] = m[2] ?? m[3]
  return result
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Убирает разметку и сноски, раскрывает &-сущности, схлопывает пробелы */
export function cleanText(raw) {
  return raw
    .replace(/<NOTE\b[\s\S]*?<\/NOTE>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Разбирает Zefania XML. Возвращает книги в порядке следования в файле:
 * [{ number, name, chapters: Map<номер главы, Map<номер стиха, текст>> }]
 */
export function parseZefania(xml) {
  const books = []
  for (const b of xml.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
    const ba = attrs(b[1])
    const chapters = new Map()
    let autoChapter = 0
    for (const c of b[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi)) {
      const ca = attrs(c[1])
      const chapterNo = Number.isFinite(Number(ca.cnumber)) && ca.cnumber ? Number(ca.cnumber) : ++autoChapter
      autoChapter = chapterNo
      const verses = chapters.get(chapterNo) ?? new Map()
      let autoVerse = 0
      for (const v of c[2].matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi)) {
        const va = attrs(v[1])
        const verseNo = Number.isFinite(Number(va.vnumber)) && va.vnumber ? Number(va.vnumber) : ++autoVerse
        autoVerse = verseNo
        const text = cleanText(v[2])
        verses.set(verseNo, verses.has(verseNo) ? `${verses.get(verseNo)} ${text}`.trim() : text)
      }
      chapters.set(chapterNo, verses)
    }
    books.push({
      number: ba.bnumber !== undefined && ba.bnumber !== '' ? Number(ba.bnumber) : null,
      name: ba.bname ?? ba.bsname ?? '',
      chapters,
    })
  }
  return books
}

/**
 * Сопоставляет книги файла с нашим списком из 66 книг.
 * 1) по номерам bnumber 1..66; 2) если номера не подходят, но книг ровно 66 — по порядку; иначе ошибка.
 * Возвращает { byId: Map<id, книга>, notes: string[] }.
 */
export function selectBooks(parsed, books) {
  const notes = []
  const byNumber = new Map(parsed.filter((b) => b.number !== null).map((b) => [b.number, b]))
  const haveAll = books.every((b) => byNumber.has(b.num))

  if (haveAll) {
    const extra = parsed.filter((b) => b.number === null || b.number < 1 || b.number > 66)
    if (extra.length) notes.push(`В файле есть дополнительные книги (${extra.length}), они пропущены.`)
    return { byId: new Map(books.map((b) => [b.id, byNumber.get(b.num)])), notes }
  }
  if (parsed.length === 66) {
    notes.push('Номера книг в файле не совпали с ожидаемыми, книги сопоставлены по порядку. Проверьте отчёт.')
    const sorted = [...books].sort((a, b) => a.num - b.num)
    return { byId: new Map(sorted.map((b, i) => [b.id, parsed[i]])), notes }
  }
  const found = parsed.map((b) => `${b.number ?? '?'}: ${b.name}`).join(', ')
  throw new Error(`Не удалось сопоставить книги: найдено ${parsed.length}, нужно 66. В файле: ${found}`)
}

/** Превращает главы книги в массив строк (индекс = номер стиха − 1; пропущенный стих — пустая строка) */
export function toChapters(book) {
  const chapterNumbers = [...book.chapters.keys()]
  const count = chapterNumbers.length ? Math.max(...chapterNumbers) : 0
  const out = []
  for (let c = 1; c <= count; c++) {
    const verses = book.chapters.get(c)
    if (!verses || verses.size === 0) {
      out.push([])
      continue
    }
    const last = Math.max(...verses.keys())
    const arr = Array.from({ length: last }, () => '')
    for (const [n, text] of verses) if (n >= 1) arr[n - 1] = text
    out.push(arr)
  }
  return out
}

/**
 * Правки известных расхождений источника с печатным Синодальным изданием.
 * Каждая правка применяется только если структура книги в точности такая, как ожидается;
 * иначе возвращается предупреждение и книга остаётся как есть.
 */
const snippet = (t) => (t.length > 60 ? `${t.slice(0, 60)}…` : t)

export const FIXUPS = {
  // В файле есть неканонические главы 13–14 (Сусанна, Бел и дракон), а деление глав 5 и 6 еврейское
  dan(ch) {
    const notes = []
    let out = ch
    if (out.length === 14 && out[12].length === 64 && out[13].length === 42) {
      out = out.slice(0, 12)
      notes.push('Даниил: удалены неканонические главы 13 (Сусанна) и 14 (Бел и дракон).')
    } else if (out.length !== 12) {
      return { chapters: ch, notes: [], warnings: [`Даниил: глав ${out.length}, ожидалось 14 или 12, правка не применена`] }
    }
    if (out[4].length === 30 && out[5].length === 29) {
      // еврейское 6:1 — это 5:31 в Синодальном издании («Дарий Мидянин принял царство»)
      const moved = out[5][0]
      out = out.map((c, i) => (i === 4 ? [...c, moved] : i === 5 ? c.slice(1) : c))
      notes.push(`Даниил: стих 6:1 источника перенесён в 5:31 («${snippet(moved)}»), глава 5 теперь 31 стих, глава 6 — 28.`)
    }
    return { chapters: out, notes, warnings: [] }
  },

  // Псалтирь: в источнике еврейская нумерация, а в Синодальном издании славянская (как в Септуагинте).
  // Псалмы 9 и 10 здесь объединены в 9-й, 114 и 115 в 113-й, 116-й разделён на 114-й и 115-й, 147-й на 146-й и 147-й,
  // а остальные с 11-го по 146-й сдвинуты на единицу. Ссылки в скобках перед стихами, например «(9:22)», убираются.
  psa(ch) {
    const PREFIX = /^\((\d+):(\d+)\)\s*/
    const expected = { 9: 21, 10: 18, 114: 8, 115: 18, 116: 19, 147: 20 }
    if (ch.length !== 150) {
      return { chapters: ch, notes: [], warnings: [`Псалтирь: глав ${ch.length}, ожидалось 150, нумерация не изменена`] }
    }
    const bad = Object.entries(expected).filter(([n, len]) => ch[Number(n) - 1].length !== len)
    if (bad.length > 0) {
      const list = bad.map(([n, len]) => `пс. ${n}: ${ch[Number(n) - 1].length} вместо ${len}`).join('; ')
      return { chapters: ch, notes: [], warnings: [`Псалтирь: неожиданное число стихов (${list}), нумерация не изменена`] }
    }

    // H[i] — псалом i+1 по еврейской нумерации; ссылки в скобках отделяются от текста
    const H = ch.map((c) =>
      c.map((raw) => {
        const m = raw.match(PREFIX)
        return { text: m ? raw.replace(PREFIX, '') : raw, ref: m ? [Number(m[1]), Number(m[2])] : null }
      }),
    )
    const out = []
    for (let i = 0; i < 8; i++) out.push(H[i]) //          1–8 без изменений
    out.push([...H[8], ...H[9]]) //                        9 = еврейские 9 и 10
    for (let i = 10; i <= 112; i++) out.push(H[i]) //      10–112 = еврейские 11–113
    out.push([...H[113], ...H[114]]) //                    113 = еврейские 114 и 115
    out.push(H[115].slice(0, 9)) //                        114 = еврейский 116:1–9
    out.push(H[115].slice(9)) //                           115 = еврейский 116:10–19
    for (let i = 116; i <= 145; i++) out.push(H[i]) //     116–145 = еврейские 117–146
    out.push(H[146].slice(0, 11)) //                       146 = еврейский 147:1–11
    out.push(H[146].slice(11)) //                          147 = еврейский 147:12–20
    out.push(H[147], H[148], H[149]) //                    148–150 без изменений

    // Если у стихов были ссылки в скобках, они должны совпасть с новым положением стиха
    let stripped = 0
    let mismatches = 0
    let example = ''
    out.forEach((c, ci) =>
      c.forEach((v, vi) => {
        if (!v.ref) return
        stripped++
        if (v.ref[0] !== ci + 1 || v.ref[1] !== vi + 1) {
          mismatches++
          if (!example) example = `ссылка ${v.ref[0]}:${v.ref[1]} стоит на месте ${ci + 1}:${vi + 1}`
        }
      }),
    )
    return {
      chapters: out.map((c) => c.map((v) => v.text)),
      notes: [`Псалтирь: нумерация приведена к Синодальной (150 псалмов); убрано ссылок в скобках перед стихами: ${stripped}.`],
      warnings: mismatches > 0 ? [`Псалтирь: ссылок в скобках, не совпавших с новым положением: ${mismatches} (например, ${example})`] : [],
    }
  },

  // В файле еврейское деление: 4 главы вместо 3 (еврейские 3:1–5 — это 2:28–32 в Синодальном)
  jol(ch) {
    if (ch.length === 3) return { chapters: ch, notes: [], warnings: [] }
    if (ch.length === 4 && ch[1].length === 27 && ch[2].length === 5 && ch[3].length === 21) {
      return {
        chapters: [ch[0], [...ch[1], ...ch[2]], ch[3]],
        notes: ['Иоиль: главы приведены к Синодальному делению (3 главы: 20, 32 и 21 стих).'],
        warnings: [],
      }
    }
    return { chapters: ch, notes: [], warnings: ['Иоиль: структура глав неожиданная, правка не применена'] }
  },
}

export function applyFixups(bookId, chapters) {
  const fix = FIXUPS[bookId]
  return fix ? fix(chapters) : { chapters, notes: [], warnings: [] }
}

/**
 * Готовит содержимое для записи: файлы книг, индекс и отчёт для человека.
 * Критичные проблемы (нет глав, пустая книга) попадают в errors, остальное — в warnings.
 */
export function buildOutput(parsed, books, meta = {}) {
  const { byId, notes } = selectBooks(parsed, books)
  const files = {}
  const indexBooks = []
  const errors = []
  const warnings = [...notes]
  const fixes = []
  const lines = []
  let totalVerses = 0
  let totalChapters = 0

  for (const b of books) {
    const fixed = applyFixups(b.id, toChapters(byId.get(b.id)))
    const chapters = fixed.chapters
    fixes.push(...fixed.notes)
    warnings.push(...fixed.warnings)
    files[b.id] = chapters
    indexBooks.push({ id: b.id, verses: chapters.map((ch) => ch.length) })

    // Ссылки вида «(9:22)» в начале стиха быть не должны; если они остались (кроме исправленных книг), сообщаем
    const prefixed = chapters.flat().filter((t) => /^\(\d+:\d+\)/.test(t)).length
    if (prefixed > 0) warnings.push(`${b.name}: стихов со ссылкой в скобках в начале: ${prefixed}`)

    const verseCount = chapters.reduce((n, ch) => n + ch.filter(Boolean).length, 0)
    totalVerses += verseCount
    totalChapters += chapters.length
    lines.push(`${b.name.padEnd(22)} глав ${String(chapters.length).padStart(3)}, стихов ${String(verseCount).padStart(5)}`)

    if (chapters.length === 0) errors.push(`${b.name}: нет глав`)
    if (chapters.length !== b.chapters) {
      warnings.push(`${b.name}: глав ${chapters.length}, ожидалось ${b.chapters}`)
    }
    chapters.forEach((ch, i) => {
      if (ch.length === 0) errors.push(`${b.name} ${i + 1}: пустая глава`)
      const gaps = ch.map((t, k) => (t ? 0 : k + 1)).filter(Boolean)
      if (gaps.length) warnings.push(`${b.name} ${i + 1}: нет текста у стихов ${gaps.join(', ')}`)
    })
  }

  const summary = `Итого: книг ${books.length}, глав ${totalChapters}, стихов ${totalVerses}`
  const index = {
    translation: meta.translation ?? 'rst',
    name: meta.name ?? 'Синодальный перевод',
    source: meta.source ?? '',
    books: indexBooks,
  }
  return { files, index, errors, warnings, fixes, report: [...lines, summary].join('\n'), totalVerses, totalChapters }
}
