import React, { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import Matching from './components/Matching';
import Chat from './components/Chat';
import Navbar from './components/Navbar';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config'; 
import { AlertCircle } from 'lucide-react'; // Ensure AlertCircle is imported

export default function App() {
  // New State: Check if user has already agreed to rules
  const [hasAgreed, setHasAgreed] = useState(() => {
    return localStorage.getItem('grc_agreed') === 'true';
  });

  // 1. Theme State: Defaults to System Preference
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('grc_theme');
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('grc_profile');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [isMatching, setIsMatching] = useState(false);
  const [userRole, setUserRole] = useState(null);

  // 2. Theme Side Effect: Applies 'dark' class to <html> tag
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('grc_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // 3. System Theme Listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleAgree = () => {
    localStorage.setItem('grc_agreed', 'true');
    setHasAgreed(true);
  };

  const resetToLobby = () => {
    setCurrentRoomId(null);
    setIsMatching(false);
    setUserRole(null);
  };

  const handleProfileUpdate = (profile) => {
    localStorage.setItem('grc_profile', JSON.stringify(profile));
    setUserProfile(profile);
  };

  const clearProfile = () => {
    localStorage.removeItem('grc_profile');
    setUserProfile(null);
    resetToLobby();
  };

  const endSession = async () => {
    if (!currentRoomId) return resetToLobby();
    try {
      const roomRef = doc(db, "rooms", currentRoomId);
      if (isMatching && userRole === 'user1') {
        await deleteDoc(roomRef);
      } else if (!isMatching) {
        await updateDoc(roomRef, { status: 'ended', endedBy: userRole });
      }
    } catch (e) {
      console.error("Error ending session:", e);
    }
    resetToLobby();
  };

  return (
    <div className="min-h-screen bg-[var(--color-app-bg)] font-sans transition-colors duration-300 overflow-x-hidden">
      
      {/* Community Rules Modal */}
      {!hasAgreed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[var(--color-card-bg)] w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-grc-red mb-6 mx-auto">
              <AlertCircle size={32} />
            </div>
            
            <h2 className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight text-center">
              Community Guidelines
            </h2>
            <p className="text-xs text-slate-500 font-bold mt-2 text-center mb-6">
              Please agree to the rules before joining GRCBuddy
            </p>

            <div className="space-y-4 mb-8">
              {[
                { t: "Respect", d: "Be kind. No harassment or bullying." },
                { t: "Privacy", d: "Don't share Student IDs or Social Media." },
                { t: "Safety", d: "No NSFW content or explicit language." },
                { t: "Integrity", d: "No academic cheating or leaked exams." }
              ].map((rule, i) => (
                <div key={i} className="flex gap-4 items-start p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                  <span className="w-5 h-5 bg-grc-red text-white text-[10px] font-black rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <h4 className="text-[11px] font-black uppercase text-[var(--color-main-text)] tracking-wider">{rule.t}</h4>
                    <p className="text-[10px] text-slate-500 font-bold leading-tight">{rule.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  id="rules-checkbox"
                  className="w-5 h-5 rounded-lg border-2 border-slate-200 dark:border-slate-700 checked:bg-grc-red transition-all appearance-none cursor-pointer relative checked:before:content-['✓'] checked:before:absolute checked:before:text-white checked:before:text-[10px] checked:before:left-1 checked:before:top-0"
                />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  I agree to follow the community guidelines.
                </span>
              </label>

              <button 
                onClick={() => {
                  const cb = document.getElementById('rules-checkbox');
                  if (cb && cb.checked) handleAgree();
                }}
                className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
              >
                Accept and Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar visible when in Chat mode */}
      {currentRoomId && !isMatching && <Navbar onEnd={endSession} />}
      
      <main className="w-full h-full flex flex-col">
        {(!currentRoomId && !isMatching) ? (
          <Lobby 
            userProfile={userProfile}
            onMatchStart={(profile, roomId, role) => {
              handleProfileUpdate(profile);
              setCurrentRoomId(roomId);
              setUserRole(role);
              setIsMatching(true);
            }} 
            onLogout={clearProfile}
            isDark={isDark}
            setIsDark={setIsDark}
          />
        ) : isMatching ? (
          <Matching 
            roomId={currentRoomId} 
            userRole={userRole}
            interests={userProfile?.interests}
            formData={userProfile}
            onMatchFound={() => setIsMatching(false)}
            onCancel={endSession}
          />
        ) : (
          <Chat 
            roomId={currentRoomId} 
            userProfile={userProfile} 
            userRole={userRole} 
            onExit={resetToLobby}
            isDark={isDark}
            setIsDark={setIsDark}
          />
        )}
      </main>
    </div>
  );
}