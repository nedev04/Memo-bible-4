import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadBook, loadIndex } from "../bible/bible";
import { BOOKS, getBook } from "../bible/books";
import { formatRange, groupVerses, TRANSLATION } from "../bible/refs";
import type { BibleIndex } from "../bible/types";
import { addVerses, liveVerses } from "../db/db";
import { prefetchAiGaps } from "../lessons/aiGaps";

export default function BibleAddPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<BibleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [texts, setTexts] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [testament, setTestament] = useState<"all" | "ot" | "nt">("all");

  const mine = useLiveQuery(() => liveVerses(), []);
  const added = useMemo(() => new Set((mine ?? []).map((v) => v.key)), [mine]);

  useEffect(() => {
    loadIndex(TRANSLATION)
      .then(setIndex)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки"),
      );
  }, []);

  useEffect(() => {
    setTexts(null);
    setSelected([]);
    setAnchor(null);
    if (!book || !chapter) return;
    loadBook(TRANSLATION, book)
      .then((chapters) => setTexts(chapters[chapter - 1] ?? []))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки"),
      );
  }, [book, chapter]);

  const key = (verse: number) => `${TRANSLATION}:${book}:${chapter}:${verse}`;
  const hasText = (verse: number) => !!texts && !!texts[verse - 1];

  function tap(verse: number) {
    if (!hasText(verse) || added.has(key(verse))) return;
    if (selected.length === 0) {
      setSelected([verse]);
      setAnchor(verse);
    } else if (anchor !== null && selected.length === 1 && verse !== anchor) {
      const [a, b] = [Math.min(anchor, verse), Math.max(anchor, verse)];
      const range: number[] = [];
      for (let n = a; n <= b; n++)
        if (hasText(n) && !added.has(key(n))) range.push(n);
      setSelected(range);
      setAnchor(null);
    } else {
      const next = selected.includes(verse)
        ? selected.filter((n) => n !== verse)
        : [...selected, verse].sort((x, y) => x - y);
      setSelected(next);
      setAnchor(next.length === 1 ? next[0] : null);
    }
  }

  function selectAll() {
    if (!texts) return;
    const all: number[] = [];
    for (let i = 0; i < texts.length; i++) {
      const n = i + 1;
      if (hasText(n) && !added.has(key(n))) all.push(n);
    }
    setSelected(all);
    setAnchor(null);
  }

  async function save() {
    if (!book || !chapter || selected.length === 0) return;
    const refs = selected.map((verse) => ({ book, chapter, verse }));
    await addVerses(refs);
    prefetchAiGaps(refs.map((r) => key(r.verse))).catch(() => {});
    navigate("/verses");
  }

  if (error) {
    return (
      <div className="add-page p-4 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          className="btn primary"
          onClick={() => window.location.reload()}
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!index) {
    return (
      <div className="add-page p-8 text-center text-slate-400">
        Загрузка книг Библии…
      </div>
    );
  }

  // ---- Шаг 1: Выбор книги ----
  if (!book) {
    const filteredBooks = BOOKS.filter((b) => {
      if (testament === "ot" && b.testament !== "ot") return false;
      if (testament === "nt" && b.testament !== "nt") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return (
      <div className="add-page">
        <header className="page-header-row">
          <button
            className="header-back-btn"
            onClick={() => navigate(-1)}
            aria-label="Назад"
          >
            <ArrowLeft size={20} />
            <span>Назад</span>
          </button>
          <h1 className="page-header-title">Выбор книги</h1>
        </header>

        {/* Поиск книги */}
        <div className="search-bar-wrap mb-3">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Поиск книги (например: Иоанна, Псалом)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="search-clear-btn"
                onClick={() => setSearch("")}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Заветы переключатель */}
        <div className="filter-chips-scroll mb-4">
          <button
            className={`filter-chip ${testament === "all" ? "active" : ""}`}
            onClick={() => setTestament("all")}
          >
            Все (66)
          </button>
          <button
            className={`filter-chip ${testament === "nt" ? "active" : ""}`}
            onClick={() => setTestament("nt")}
          >
            Новый Завет (27)
          </button>
          <button
            className={`filter-chip ${testament === "ot" ? "active" : ""}`}
            onClick={() => setTestament("ot")}
          >
            Ветхий Завет (39)
          </button>
        </div>

        {/* Сетка книг */}
        <div className="books-grid">
          {filteredBooks.map((b) => {
            const count =
              index.books.find((ib) => ib.id === b.id)?.verses.length || 0;
            return (
              <button
                key={b.id}
                className="book-card-item"
                onClick={() => setBook(b.id)}
              >
                <div className="book-card-name">{b.name}</div>
                <div className="book-card-meta">{count} глав</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const meta = getBook(book)!;
  const verseCounts = index.books.find((b) => b.id === book)?.verses ?? [];

  // ---- Шаг 2: Выбор главы ----
  if (!chapter) {
    return (
      <div className="add-page">
        <header className="page-header-row">
          <button
            className="header-back-btn"
            onClick={() => setBook(null)}
            aria-label="Назад к книгам"
          >
            <ArrowLeft size={20} />
            <span>Книги</span>
          </button>
          <h1 className="page-header-title">{meta.name}</h1>
        </header>

        <h2 className="section-subhead">Выберите главу</h2>

        <div className="chapter-num-grid">
          {verseCounts.map((_, i) => (
            <button
              key={i}
              className="chapter-num-btn"
              onClick={() => setChapter(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Шаг 3: Выбор стихов ----
  const summary =
    selected.length > 0
      ? groupVerses(selected.map((verse) => ({ book, chapter, verse })))
          .map(formatRange)
          .join(", ")
      : "Ничего не выбрано";

  return (
    <div className="add-page pb-24">
      <header className="page-header-row">
        <button
          className="header-back-btn"
          onClick={() => setChapter(null)}
          aria-label="Назад к главам"
        >
          <ArrowLeft size={20} />
          <span>{meta.name}, главы</span>
        </button>
        <h1 className="page-header-title">
          {meta.name} {chapter}
        </h1>
      </header>

      <p className="add-verse-hint">
        Коснитесь первого стиха, затем последнего: выделится весь диапазон.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          className="btn ghost small"
          onClick={selectAll}
          disabled={!texts}
        >
          Вся глава
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            setSelected([]);
            setAnchor(null);
          }}
          disabled={selected.length === 0}
        >
          Сбросить
        </button>
      </div>

      {!texts && (
        <div className="text-slate-400 py-6 text-center">
          Загрузка текста главы…
        </div>
      )}

      <div className="verse-picker-list">
        {texts?.map((t, i) => {
          const n = i + 1;
          if (!t) return null;
          const isAdded = added.has(key(n));
          const isSel = selected.includes(n);

          return (
            <button
              key={n}
              className={`verse-pick-item ${isSel ? "selected" : ""} ${isAdded ? "added" : ""}`}
              onClick={() => tap(n)}
              disabled={isAdded}
            >
              <span className="verse-pick-num">{n}</span>
              <span className="verse-pick-text">{t}</span>
              {isAdded && <span className="verse-pick-tag">Уже в списке</span>}
              {isSel && (
                <span className="verse-pick-check">
                  <Check size={16} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Липкая нижняя панель сохранения */}
      <div className="sticky-add-bar">
        <div className="sticky-add-text">
          {selected.length > 0 ? (
            <div>
              <strong className="block text-sm text-slate-100">
                {summary}
              </strong>
              <small className="text-xs text-blue-400">
                Выбрано стихов: {selected.length}
              </small>
            </div>
          ) : (
            <span className="text-slate-400 text-sm">
              Выберите стихи для добавления
            </span>
          )}
        </div>
        <button
          className="btn primary-accent font-medium px-5"
          disabled={selected.length === 0}
          onClick={save}
        >
          <Plus size={18} />
          <span>
            Добавить{selected.length > 0 ? ` (${selected.length})` : ""}
          </span>
        </button>
      </div>
    </div>
  );
}
