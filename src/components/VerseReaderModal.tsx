import { ArrowLeft, Check, Copy, Heart, Share2, Sparkles, Type, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STRENGTH_LABEL, type StrengthGroup } from '../logic/mastery'

interface VerseReaderModalProps {
  isOpen: boolean
  onClose: () => void
  reference: string
  text: string
  strength?: number
  level?: StrengthGroup
  keys?: string[]
}

export default function VerseReaderModal({
  isOpen,
  onClose,
  reference,
  text,
  strength = 0,
  level = 'new',
  keys = [],
}: VerseReaderModalProps) {
  const [copied, setCopied] = useState(false)
  const [favorite, setFavorite] = useState(() => {
    return localStorage.getItem(`fav_${reference}`) === 'true'
  })
  const [fontScale, setFontScale] = useState<1 | 1.15 | 1.3>(1.15)

  if (!isOpen) return null

  function toggleFavorite() {
    const next = !favorite
    setFavorite(next)
    localStorage.setItem(`fav_${reference}`, String(next))
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${reference}\n${text}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: reference,
          text: `${reference}\n\n${text}\n\n— Из приложения «Наизусть»`,
        })
      } catch {
        // user cancelled or unsupported
      }
    } else {
      handleCopy()
    }
  }

  function cycleFont() {
    setFontScale((prev) => (prev === 1 ? 1.15 : prev === 1.15 ? 1.3 : 1))
  }

  // Извлекаем номер первого стиха для крупной цифры сверху
  const verseMatch = reference.match(/:(\d+)/)
  const verseNum = verseMatch ? verseMatch[1] : '•'

  return (
    <div className="reader-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="reader-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Верхняя панель действий */}
        <header className="reader-header">
          <button className="reader-back-btn" onClick={onClose} aria-label="Назад">
            <ArrowLeft size={20} />
            <span>Назад</span>
          </button>

          <div className="reader-tools">
            <button
              className="reader-tool-btn"
              onClick={cycleFont}
              aria-label="Изменить размер текста"
              title="Размер шрифта"
            >
              <Type size={18} />
            </button>
            <button
              className="reader-tool-btn"
              onClick={handleCopy}
              aria-label="Скопировать стих"
              title={copied ? 'Скопировано!' : 'Копировать'}
            >
              {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            </button>
            <button
              className="reader-tool-btn"
              onClick={handleShare}
              aria-label="Поделиться"
              title="Поделиться"
            >
              <Share2 size={18} />
            </button>
            <button
              className={`reader-tool-btn ${favorite ? 'text-rose-400' : ''}`}
              onClick={toggleFavorite}
              aria-label="В избранное"
              title="В избранное"
            >
              <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
            </button>
          </div>
        </header>

        {/* Тело стиха */}
        <div className="reader-body">
          <div className="reader-verse-num">{verseNum}</div>
          <h2 className="reader-reference">{reference}</h2>
          <div className="reader-translation-tag">Синодальный перевод · RST</div>

          <div className="reader-divider" />

          <div
            className="reader-text font-serif"
            style={{ fontSize: `calc(1.15rem * ${fontScale})`, lineHeight: '1.75' }}
          >
            {text || 'Загрузка текста стиха…'}
          </div>

          <div className="reader-meta-footer">
            <div className="reader-strength-box">
              <span className="reader-strength-label">Уровень запоминания:</span>
              <span className="reader-strength-val">{STRENGTH_LABEL[level]} (сила {strength}/7)</span>
            </div>
          </div>
        </div>

        {/* Нижние действия */}
        <footer className="reader-footer">
          {keys.length > 0 && (
            <Link
              to={`/practice?keys=${keys.join(',')}`}
              className="btn primary grow text-center font-medium"
              onClick={onClose}
            >
              <Sparkles size={18} className="inline mr-2" />
              Тренировать этот стих
            </Link>
          )}
          <button className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </footer>
      </div>
    </div>
  )
}
