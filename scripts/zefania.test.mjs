import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyFixups, buildOutput, cleanText, parseZefania, selectBooks, toChapters } from './zefania.mjs'

const books = JSON.parse(readFileSync(new URL('../src/bible/books.json', import.meta.url), 'utf8'))

/** Минимальный файл: по одной книге с одной главой и одним стихом */
function fakeXml(count = 66, numberOf = (i) => i + 1) {
  const parts = []
  for (let i = 0; i < count; i++) {
    parts.push(`<BIBLEBOOK bnumber="${numberOf(i)}" bname="Книга ${i + 1}"><CHAPTER cnumber="1"><VERS vnumber="1">Текст ${i + 1}</VERS></CHAPTER></BIBLEBOOK>`)
  }
  return `<?xml version="1.0"?><XMLBIBLE>${parts.join('\n')}</XMLBIBLE>`
}

describe('cleanText', () => {
  it('убирает разметку, сноски и сущности', () => {
    expect(cleanText('В начале <STYLE css="x">сотворил</STYLE> Бог&nbsp;небо &amp; землю<NOTE>сноска</NOTE>.\n  '))
      .toBe('В начале сотворил Бог небо & землю.')
    expect(cleanText('&#1041;&#x41;')).toBe('БA')
  })
})

describe('parseZefania', () => {
  const xml = `<XMLBIBLE>
    <BIBLEBOOK bnumber="1" bname="Бытие">
      <CHAPTER cnumber="1">
        <VERS vnumber="1">Первый</VERS>
        <VERS vnumber="3">Третий</VERS>
      </CHAPTER>
      <CHAPTER cnumber="2"><VERS vnumber="1">Глава два</VERS></CHAPTER>
    </BIBLEBOOK></XMLBIBLE>`

  it('читает книги, главы и стихи', () => {
    const [b] = parseZefania(xml)
    expect(b.number).toBe(1)
    expect(b.name).toBe('Бытие')
    expect(b.chapters.get(1).get(3)).toBe('Третий')
  })

  it('пропущенный стих становится пустой строкой', () => {
    const [b] = parseZefania(xml)
    expect(toChapters(b)).toEqual([['Первый', '', 'Третий'], ['Глава два']])
  })
})

describe('selectBooks / buildOutput', () => {
  it('сопоставляет по номерам, дополнительные книги пропускает', () => {
    const parsed = parseZefania(fakeXml(70))
    const { byId, notes } = selectBooks(parsed, books)
    expect(byId.size).toBe(66)
    expect(byId.get('gen').name).toBe('Книга 1')
    expect(byId.get('rev').name).toBe('Книга 66') // Откровение — 66-я в источнике
    expect(notes.length).toBe(1)
  })

  it('если номера странные, но книг 66 — по порядку', () => {
    const parsed = parseZefania(fakeXml(66, (i) => i + 1000))
    const { notes } = selectBooks(parsed, books)
    expect(notes[0]).toMatch(/по порядку/)
  })

  it('если книг не хватает — понятная ошибка', () => {
    expect(() => selectBooks(parseZefania(fakeXml(60)), books)).toThrow(/нужно 66/)
  })

  it('собирает файлы, индекс и отчёт', () => {
    const out = buildOutput(parseZefania(fakeXml(66)), books, { source: 'test' })
    expect(Object.keys(out.files)).toHaveLength(66)
    expect(out.index.books[0]).toEqual({ id: 'gen', verses: [1] })
    expect(out.index.source).toBe('test')
    expect(out.totalVerses).toBe(66)
    expect(out.errors).toEqual([])
    expect(out.warnings.some((w) => w.includes('глав 1, ожидалось 50'))).toBe(true)
  })
})

const chapter = (n, label = 'в') => Array.from({ length: n }, (_, i) => `${label}${i + 1}`)

describe('правки источника', () => {
  const sizes = [21, 49, 100, 34, 30, 29, 28, 27, 27, 21, 45, 13, 64, 42]

  it('Даниил: убирает главы 13–14 и переносит 6:1 в 5:31', () => {
    const src = sizes.map((n, i) => chapter(n, `д${i + 1}_`))
    const { chapters, notes, warnings } = applyFixups('dan', src)
    expect(chapters.map((c) => c.length)).toEqual([21, 49, 100, 34, 31, 28, 28, 27, 27, 21, 45, 13])
    expect(chapters[4][30]).toBe('д6_1')
    expect(chapters[5][0]).toBe('д6_2')
    expect(notes).toHaveLength(2)
    expect(warnings).toEqual([])
  })

  it('Даниил: при другой структуре ничего не меняет и предупреждает', () => {
    const src = [chapter(5), chapter(5), chapter(5)]
    const { chapters, warnings } = applyFixups('dan', src)
    expect(chapters).toBe(src)
    expect(warnings).toHaveLength(1)
  })

  it('Иоиль: 4 главы превращаются в 3 с делением 20 / 32 / 21', () => {
    const src = [chapter(20), chapter(27), chapter(5), chapter(21)]
    const { chapters } = applyFixups('jol', src)
    expect(chapters.map((c) => c.length)).toEqual([20, 32, 21])
    expect(chapters[1][27]).toBe('в1') // бывший стих 3:1 стал 2:28
  })

  it('Иоиль: готовое деление не трогает', () => {
    const src = [chapter(20), chapter(32), chapter(21)]
    expect(applyFixups('jol', src).chapters).toBe(src)
  })

  it('прочие книги не меняются', () => {
    const src = [chapter(3)]
    expect(applyFixups('gen', src).chapters).toBe(src)
  })
})

describe('Псалтирь: синодальная нумерация', () => {
  // Еврейская нумерация: у каждого псалма по 3 стиха, кроме особых
  const size = (n) => ({ 9: 21, 10: 18, 114: 8, 115: 18, 116: 19, 147: 20 })[n] ?? 3
  const hebrew = Array.from({ length: 150 }, (_, i) => {
    const n = i + 1
    return Array.from({ length: size(n) }, (_, v) => `h${n}_${v + 1}`)
  })
  // Как в источнике: стихи еврейского 10-го псалма снабжены ссылками (9:22)–(9:39)
  hebrew[9] = hebrew[9].map((t, v) => `(9:${22 + v}) ${t}`)

  it('объединяет и разделяет псалмы, сдвигает остальные', () => {
    const { chapters, notes, warnings } = applyFixups('psa', hebrew)
    expect(chapters).toHaveLength(150)
    expect(chapters[8]).toHaveLength(39) // 9 = еврейские 9 и 10
    expect(chapters[8][20]).toBe('h9_21')
    expect(chapters[8][21]).toBe('h10_1') // ссылка в скобках убрана
    expect(chapters[8][38]).toBe('h10_18')
    expect(chapters[9][0]).toBe('h11_1') // 10 = еврейский 11
    expect(chapters[111][0]).toBe('h113_1') // 112 = еврейский 113
    expect(chapters[112]).toHaveLength(26) // 113 = еврейские 114 и 115
    expect(chapters[112][8]).toBe('h115_1')
    expect(chapters[113]).toHaveLength(9) // 114 = еврейский 116:1–9
    expect(chapters[114]).toHaveLength(10) // 115 = еврейский 116:10–19
    expect(chapters[114][0]).toBe('h116_10')
    expect(chapters[115][0]).toBe('h117_1') // 116 = еврейский 117
    expect(chapters[144][0]).toBe('h146_1') // 145 = еврейский 146
    expect(chapters[145]).toHaveLength(11) // 146 = еврейский 147:1–11
    expect(chapters[146]).toHaveLength(9) // 147 = еврейский 147:12–20
    expect(chapters[146][0]).toBe('h147_12')
    expect(chapters[149][0]).toBe('h150_1')
    expect(chapters.flat().length).toBe(hebrew.flat().length) // стихов столько же
    expect(chapters.flat().some((t) => /^\(\d+:\d+\)/.test(t))).toBe(false)
    expect(notes).toHaveLength(1)
    expect(warnings).toEqual([])
  })

  it('при неожиданном числе стихов ничего не меняет и предупреждает', () => {
    const odd = hebrew.map((c, i) => (i === 8 ? c.slice(0, 5) : c))
    const result = applyFixups('psa', odd)
    expect(result.chapters).toBe(odd)
    expect(result.warnings).toHaveLength(1)
  })

  it('ссылки, не совпавшие с новым положением, попадают в предупреждения', () => {
    const wrong = hebrew.map((c, i) => (i === 10 ? c.map((t) => `(99:1) ${t}`) : c))
    const { warnings } = applyFixups('psa', wrong)
    expect(warnings).toHaveLength(1)
  })
})
