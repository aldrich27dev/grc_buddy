import React, { useState, useEffect } from 'react';
import { LogOut, Heart, Sun, Moon, AlertCircle } from 'lucide-react';

export default function Navbar({ onEnd }) {
  const [isDark, setIsDark] = useState(false);
  // State for the custom confirmation popup
  const [showExitModal, setShowExitModal] = useState(false);

  // Toggle the .dark class on the root element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const confirmExit = () => {
    setShowExitModal(false);
    onEnd();
  };

  return (
    <>
      {/* Navbar Container: sticky top-0 ensures it stays at the top during scroll */}
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

 {/* VERY RIGHT: Theme Toggle inside Chat.jsx */}
<div className="flex items-center justify-end gap-3 shrink-0">
  <button 
    onClick={() => setIsDark(!isDark)} // Uses the function from App.jsx
    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-yellow-400 transition-all hover:scale-110 active:scale-95"
    aria-label="Toggle Theme"
  >
    {/* Use the isDark prop passed from App.jsx */}
    {isDark ? (
      <Sun size={18} className="animate-in zoom-in duration-300" />
    ) : (
      <Moon size={18} className="animate-in zoom-in duration-300" />
    )}
  </button>
</div>
</div>
      </nav>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-card-bg)] w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 p-8 transform animate-in zoom-in-95 duration-200">
            
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-grc-red mx-auto mb-6">
              <AlertCircle size={32} />
            </div>

            <h3 className="text-xl font-bold text-[var(--color-main-text)] text-center mb-2">
              End Conversation?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8 px-4">
              Are you sure? You will be disconnected from your current buddy.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={confirmExit}
                className="w-full py-4 bg-grc-red text-white rounded-2xl font-bold hover:brightness-95 active:scale-[0.98] transition-all shadow-lg shadow-red-200 dark:shadow-none"
              >
                Yes, End Chat
              </button>
              
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-[var(--color-main-text)] rounded-2xl font-bold hover:brightness-95 active:scale-[0.98] transition-all"
              >
                Stay Connected
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}