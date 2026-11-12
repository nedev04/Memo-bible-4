import { BarChart3, BookOpen, Home, Plus, Settings } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSync } from '../sync/SyncProvider'

export default function BottomNav() {
  const location = useLocation()
  const { status } = useSync()

  // Скрываем нижнюю панель на экранах урока и чистой тренировки, чтобы не отвлекать от упражнений
  const hiddenOn = ['/lesson', '/practice']
  if (hiddenOn.includes(location.pathname)) {
    return null
  }

  const hasSyncIssue = status === 'error'

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      <div className="bottom-nav-inner">
        {/* 1. Главная */}
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          <div className="nav-icon-wrap">
            <Home size={22} strokeWidth={2.2} />
          </div>
          <span className="nav-label">Главная</span>
        </NavLink>

        {/* 2. Стихи */}
        <NavLink
          to="/verses"
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          <div className="nav-icon-wrap">
            <BookOpen size={22} strokeWidth={2.2} />
          </div>
          <span className="nav-label">Стихи</span>
        </NavLink>

        {/* 3. Центр: Добавить новый стих */}
        <NavLink
          to="/add"
          className={({ isActive }) => `nav-tab-center ${isActive ? 'active' : ''}`}
          aria-label="Добавить новый стих из Библии"
          title="Добавить стихи"
        >
          <div className="center-button">
            <Plus size={26} strokeWidth={2.8} />
          </div>
        </NavLink>

        {/* 4. Статистика */}
        <NavLink
          to="/stats"
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          <div className="nav-icon-wrap">
            <BarChart3 size={22} strokeWidth={2.2} />
          </div>
          <span className="nav-label">Статистика</span>
        </NavLink>

        {/* 5. Настройки */}
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          <div className="nav-icon-wrap relative">
            <Settings size={22} strokeWidth={2.2} />
            {hasSyncIssue && (
              <span
                className="sync-dot-badge"
                title="Ошибка синхронизации"
                aria-label="Ошибка синхронизации"
              />
            )}
          </div>
          <span className="nav-label">Настройки</span>
        </NavLink>
      </div>
    </nav>
  )
}
