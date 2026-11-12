import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Heart,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadBook } from "../bible/bible";
import { bookOrder, getBook } from "../bible/books";
import { formatRange, TRANSLATION } from "../bible/refs";
import VerseReaderModal from "../components/VerseReaderModal";
import { liveVerses, removeVerses } from "../db/db";
import { buildLibrary, levelCounts, type LibraryGroup } from "../logic/library";
import {
  dueLabel,
  isDue,
  STRENGTH_LABEL,
  type StrengthGroup,
} from "../logic/mastery";

type Filter = "all" | StrengthGroup;
type SortBy = "order" | "strength" | "due";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "learned", label: STRENGTH_LABEL.learned },
  { id: "strong", label: STRENGTH_LABEL.strong },
  { id: "medium", label: STRENGTH_LABEL.medium },
  { id: "started", label: STRENGTH_LABEL.started },
  { id: "new", label: STRENGTH_LABEL.new },
];

const STRENGTH_COLORS: Record<number, string> = {
  0: "#64748b",
  1: "#ef4444", // 1: красный
  2: "#f97316", // 2: оранжевый
  3: "#10b981", // 3: зелёный (как в примере Пс 118:1)
  4: "#14b8a6", // 4: бирюзовый
  5: "#3b82f6", // 5: синий
  6: "#6366f1", // 6: индиго
  7: "#1e3a8a", // 7: тёмно-синий (как в примере Пс 117:28-29)
};

function StrengthDots({ strength }: { strength: number }) {
  const activeColor = STRENGTH_COLORS[strength] || "#3b82f6";
  return (
    <div className="strength-dots-row" title={`Сила ${strength} из 7`}>
      {Array.from({ length: 7 }).map((_, i) => {
        const isFilled = i < strength;
        return (
          <span
            key={i}
            className={`strength-dot ${isFilled ? "filled" : "empty"}`}
            style={{
              backgroundColor: isFilled ? activeColor : "transparent",
              borderColor: isFilled ? activeColor : "var(--muted)",
            }}
          />
        );
      })}
    </div>
  );
}

interface BookSection {
  bookId: string;
  bookName: string;
  groups: LibraryGroup[];
}

export default function VersesPage() {
  const verses = useLiveQuery(() => liveVerses(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("order");
  const [collapsedBooks, setCollapsedBooks] = useState<Record<string, boolean>>(
    {},
  );

  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("memo_favorites");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Тексты стихов
  const [verseTexts, setVerseTexts] = useState<Record<string, string>>({});

  // Модальное окно чтения стиха
  const [readerVerse, setReaderVerse] = useState<{
    reference: string;
    text: string;
    strength: number;
    level: any;
    keys: string[];
  } | null>(null);

  const library = useMemo(() => buildLibrary(verses ?? []), [verses]);
  const counts = useMemo(() => levelCounts(verses ?? []), [verses]);

  // Загрузка текстов для всех добавленных стихов
  useEffect(() => {
    if (!verses || verses.length === 0) return;
    let active = true;

    const bookSet = new Set(verses.map((v) => v.book));
    Promise.all(
      Array.from(bookSet).map(async (bookId) => {
        try {
          const chapters = await loadBook(TRANSLATION, bookId);
          return { bookId, chapters };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!active) return;
      const map: Record<string, string> = {};
      for (const res of results) {
        if (!res) continue;
        const { bookId, chapters } = res;
        verses
          .filter((v) => v.book === bookId)
          .forEach((v) => {
            const chVerses = chapters[v.chapter - 1] ?? [];
            map[v.key] = chVerses[v.verse - 1] ?? "";
          });
      }
      setVerseTexts(map);
    });

    return () => {
      active = false;
    };
  }, [verses]);

  function getGroupSnippet(g: LibraryGroup): string {
    const combined = g.keys
      .map((k) => verseTexts[k])
      .filter(Boolean)
      .join(" ");
    return combined || "Загрузка текста…";
  }

  function toggleFavorite(key: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = { ...favorites, [key]: !favorites[key] };
    setFavorites(next);
    localStorage.setItem("memo_favorites", JSON.stringify(next));
  }

  async function handleDeleteGroup(group: LibraryGroup, e: React.MouseEvent) {
    e.stopPropagation();
    const label = formatRange(group);
    if (!confirm(`Убрать «${label}» из списка изучаемых стихов?`)) return;
    await removeVerses(group.keys);
  }

  function toggleBookCollapse(bookId: string) {
    setCollapsedBooks((prev) => ({
      ...prev,
      [bookId]: !prev[bookId],
    }));
  }

  function cycleSort() {
    setSortBy((prev) =>
      prev === "order" ? "strength" : prev === "strength" ? "due" : "order",
    );
  }

  // Фильтрация и поиск (все хуки до любых условий возврата)
  const filtered = useMemo(() => {
    return library.filter((g) => {
      if (filter !== "all" && g.level !== filter) return false;
      if (search.trim()) {
        const label = formatRange(g).toLowerCase();
        const text = getGroupSnippet(g).toLowerCase();
        const q = search.toLowerCase();
        return label.includes(q) || text.includes(q);
      }
      return true;
    });
  }, [library, filter, search, verseTexts]);

  // Сортировка
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "strength") return b.minStrength - a.minStrength;
      if (sortBy === "due") return a.soonest - b.soonest;
      return 0; // order by Bible
    });
  }, [filtered, sortBy]);

  // Группировка по книгам Библии
  const bookSections: BookSection[] = useMemo(() => {
    const bookMap = new Map<string, LibraryGroup[]>();
    for (const g of sorted) {
      const list = bookMap.get(g.book) || [];
      list.push(g);
      bookMap.set(g.book, list);
    }

    const sections: BookSection[] = [];
    for (const [bookId, groups] of bookMap.entries()) {
      const info = getBook(bookId);
      sections.push({
        bookId,
        bookName: info?.name || bookId,
        groups,
      });
    }

    if (sortBy === "order") {
      sections.sort((a, b) => bookOrder(a.bookId) - bookOrder(b.bookId));
    }
    return sections;
  }, [sorted, sortBy]);

  const now = Date.now();

  const sortLabel: Record<SortBy, string> = {
    order: "По Библии",
    strength: "По силе",
    due: "По повторению",
  };

  if (!verses) {
    return (
      <div className="verses-page">
        <div
          className="verses-empty"
          style={{ minHeight: "260px", justifyContent: "center" }}
        >
          <p className="text-slate-400 text-sm">Загрузка стихов…</p>
        </div>
      </div>
    );
  }

  function openReader(group: LibraryGroup) {
    const ref = formatRange(group);
    const text = getGroupSnippet(group);
    setReaderVerse({
      reference: ref,
      text: text,
      strength: group.minStrength,
      level: group.level,
      keys: group.keys,
    });
  }

  return (
    <div className="verses-page">
      {/* Модальное окно чтения */}
      {readerVerse && (
        <VerseReaderModal
          isOpen={true}
          onClose={() => setReaderVerse(null)}
          reference={readerVerse.reference}
          text={readerVerse.text}
          strength={readerVerse.strength}
          level={readerVerse.level}
          keys={readerVerse.keys}
        />
      )}

      {/* Верхний блок: Поиск и сортировка (без внутренней синей рамки) */}
      <div className="search-bar-wrap">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Поиск по стиху, книге или тексту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="search-clear-btn"
              onClick={() => setSearch("")}
              aria-label="Очистить поиск"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          className="sort-btn"
          onClick={cycleSort}
          title={`Сортировка: ${sortLabel[sortBy]}`}
          aria-label="Сортировка"
        >
          <ArrowUpDown size={18} />
        </button>
      </div>

      {/* Подстрока с количеством и текущей сортировкой */}
      <div className="verses-meta-line">
        <span className="verses-count">Найдено: {sorted.length}</span>
        <button className="verses-sort-indicator" onClick={cycleSort}>
          Сортировка: {sortLabel[sortBy]}
        </button>
      </div>

      {/* Фильтр-чипы по силе */}
      <div className="filter-chips-scroll">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? verses.length : counts[f.id];
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              className={`filter-chip ${isActive ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              <span>{f.label}</span>
              <span className="filter-chip-num">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Список стихов, сгруппированный по книгам Библии */}
      {sorted.length === 0 ? (
        <div className="verses-empty">
          <BookOpen size={36} className="text-slate-500 mb-2" />
          <p className="text-slate-400 text-sm">
            {search
              ? "По вашему запросу ничего не найдено."
              : "В этой категории пока нет стихов."}
          </p>
          <Link
            to="/add"
            className="btn primary-accent mt-4 inline-flex items-center gap-2"
          >
            <Plus size={16} />
            <span>Добавить стихи</span>
          </Link>
        </div>
      ) : (
        <div className="verses-sections-wrap">
          {bookSections.map((section) => {
            const isCollapsed = !!collapsedBooks[section.bookId];

            return (
              <div key={section.bookId} className="book-group-section">
                {/* Заголовок книги с полупрозрачной стрелочкой для сворачивания */}
                <button
                  className="book-group-header"
                  onClick={() => toggleBookCollapse(section.bookId)}
                  aria-expanded={!isCollapsed}
                >
                  <div className="book-group-title-wrap">
                    <span className="book-group-title">{section.bookName}</span>
                    <span className="book-group-count">
                      {section.groups.length}{" "}
                      {section.groups.length === 1
                        ? "отрывок"
                        : section.groups.length < 5
                          ? "отрывка"
                          : "отрывков"}
                    </span>
                  </div>
                  <div className="book-group-toggle-icon">
                    {isCollapsed ? (
                      <ChevronRight size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </div>
                </button>

                {/* Список стихов книги: карточки стихов прямо под заголовком книги */}
                {!isCollapsed && (
                  <div className="book-group-verses">
                    {section.groups.map((g) => {
                      const label = formatRange(g);
                      const text = getGroupSnippet(g);
                      const isFav = !!favorites[label];
                      const badgeText =
                        g.from === g.to ? `${g.from}` : `${g.from}–${g.to}`;
                      const isDueNow = isDue({ nextReviewAt: g.soonest }, now);

                      return (
                        <div
                          key={label}
                          className="verse-row-card"
                          onClick={() => openReader(g)}
                          role="button"
                          tabIndex={0}
                        >
                          {/* Кружок слева: номер стиха или диапазон "2–5" (центрирован по вертикали) */}
                          <div className="verse-num-badge">{badgeText}</div>

                          {/* Основное содержимое */}
                          <div className="verse-row-content">
                            {/* Ссылка полностью (не обрезается) */}
                            <div className="verse-row-title">{label}</div>

                            {/* Текст стиха длиннее (до 4 строк) */}
                            <div className="verse-row-snippet">{text}</div>

                            {/* Точки силы и статус повторения с мягким оранжевым цветом */}
                            <div className="verse-row-meta">
                              <StrengthDots strength={g.minStrength} />
                              <span className="dot-sep">·</span>
                              <span>{STRENGTH_LABEL[g.level]}</span>
                              <span className="dot-sep">·</span>
                              <span
                                className={
                                  isDueNow
                                    ? "verse-due-text due"
                                    : "verse-due-text"
                                }
                              >
                                {dueLabel(g.soonest, now)}
                              </span>
                            </div>
                          </div>

                          {/* 3 кнопки справа в СТОЛБИК (центрированы по вертикали) */}
                          <div className="verse-row-actions-col">
                            <Link
                              to={`/practice?keys=${g.keys.join(",")}`}
                              className="verse-action-btn play"
                              title="Тренировать"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Тренировать ${label}`}
                            >
                              <Play size={14} />
                            </Link>
                            <button
                              className={`verse-action-btn heart ${isFav ? "active" : ""}`}
                              onClick={(e) => toggleFavorite(label, e)}
                              title={
                                isFav ? "В избранном" : "Добавить в избранное"
                              }
                              aria-label="В избранное"
                            >
                              <Heart
                                size={14}
                                fill={isFav ? "currentColor" : "none"}
                              />
                            </button>
                            <button
                              className="verse-action-btn trash"
                              onClick={(e) => handleDeleteGroup(g, e)}
                              title="Убрать из списка"
                              aria-label="Удалить"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
