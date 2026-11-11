import { Heart, Sun, Moon } from 'lucide-react';

export default function Navbar({ isDark, onToggleTheme }) {
  return (
    <nav className="sticky top-0 z-50 w-full h-18 border-b border-slate-100 dark:border-slate-800 bg-[var(--color-app-bg)]/80 backdrop-blur-md transition-colors duration-300 shrink-0">
      <div className="max-w-4xl mx-auto px-6 h-18 flex items-center justify-between">

        {/* Center: Logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 select-none">
          <div className="bg-grc-red p-1.5 rounded-lg shadow-lg shadow-red-200 dark:shadow-none">
            <Heart size={16} className="text-white fill-white" />
          </div>
          <span className="font-bold text-[var(--color-main-text)] text-lg tracking-tight">
            GRC<span className="text-grc-red">Buddy</span>
          </span>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center justify-end gap-3 shrink-0 ml-auto">
          <button
            onClick={onToggleTheme}
            type="button"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-yellow-400 transition-all hover:scale-110 active:scale-95"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun size={18} className="animate-pop-in" />
            ) : (
              <Moon size={18} className="animate-pop-in" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
