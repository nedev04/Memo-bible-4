import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import BibleAddPage from "./pages/BibleAddPage";
import LessonPage from "./pages/LessonPage";
import PracticePage from "./pages/PracticePage";
import SettingsPage from "./pages/SettingsPage";
import StatsPage from "./pages/StatsPage";
import TodayPage from "./pages/TodayPage";
import VersesPage from "./pages/VersesPage";
import { SyncProvider } from "./sync/SyncProvider";
import { ThemeProvider } from "./theme/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <SyncProvider>
        <HashRouter>
          <div className="app-shell">
            <main className="app-main">
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/verses" element={<VersesPage />} />
                <Route path="/add" element={<BibleAddPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route
                  path="/data"
                  element={<Navigate to="/settings" replace />}
                />
                <Route path="/lesson" element={<LessonPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <BottomNav />
          </div>
        </HashRouter>
      </SyncProvider>
    </ThemeProvider>
  );
}
