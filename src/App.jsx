import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AlertCircle, Heart } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import Lobby from './components/Lobby';
import Matching from './components/Matching';
import Chat from './components/Chat';
import Navbar from './components/Navbar';
import { auth, ensureSignedIn } from './firebase/auth';
import { getRole, getRoom, leaveRoom } from './services/rooms';
import useOnlineStatus from './hooks/useOnlineStatus';
import { readJSON, writeJSON, removeKey } from './lib/storage';
import { MIN_INTERESTS } from './constants/catalog';

const THEME_KEY = 'grc_theme';
const AGREED_KEY = 'grc_agreed';
const PROFILE_KEY = 'grc_profile';
const SESSION_KEY = 'grc_session';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
  } catch {
    // Fall through to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readProfile() {
  const profile = readJSON(localStorage, PROFILE_KEY);
  if (!profile || typeof profile !== 'object') return null;

  const requiredFields = ['name', 'year', 'course', 'gender', 'location'];
  const isComplete = requiredFields.every(
    (field) => typeof profile[field] === 'string' && profile[field].trim().length > 0
  );

  if (!isComplete) return null;
  if (!Array.isArray(profile.interests) || profile.interests.length < MIN_INTERESTS) return null;

  return profile;
}

function readSession() {
  const session = readJSON(sessionStorage, SESSION_KEY);
  return session && session.roomId ? session : null;
}

export default function App() {
  const [hasAgreed, setHasAgreed] = useState(() => {
    try {
      return localStorage.getItem(AGREED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [guidelinesChecked, setGuidelinesChecked] = useState(false);

  const [isDark, setIsDark] = useState(getInitialTheme);
  const [userProfile, setUserProfile] = useState(readProfile);

  const [bootSession] = useState(() => readSession());
  const [session, setSession] = useState(bootSession);
  const [phase, setPhase] = useState(bootSession ? 'resuming' : 'lobby');

  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  const online = useOnlineStatus();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Theme still applies for this session if storage is unavailable.
    }
  }, [isDark]);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      setAuthUser(user);
      setAuthReady(true);
    });

    ensureSignedIn().catch((error) => {
      if (!active) return;
      console.error('Anonymous sign-in failed:', error);
      setAuthError(error);
      setAuthReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // This effect only resolves the session captured at boot. Once the phase
    // moves on, later auth events and profile updates must not pull the user
    // back into an old room.
    if (!authReady || !authUser || phase !== 'resuming') return;
    if (!bootSession) return;

    let active = true;

    (async () => {
      try {
        const room = await getRoom(bootSession.roomId);
        if (!active) return;

        if (!readProfile()) {
          removeKey(sessionStorage, SESSION_KEY);
          setSession(null);
          setPhase('lobby');
          return;
        }

        const role = getRole(room, authUser.uid);
        if (!room || room.status === 'ended' || !role) {
          removeKey(sessionStorage, SESSION_KEY);
          setSession(null);
          setPhase('lobby');
          return;
        }

        setSession({ roomId: bootSession.roomId, role });
        setPhase(room.status === 'full' ? 'chat' : 'searching');
      } catch (error) {
        if (!active) return;
        console.error('Could not resume the previous session:', error);
        removeKey(sessionStorage, SESSION_KEY);
        setSession(null);
        setPhase('lobby');
      }
    })();

    return () => {
      active = false;
    };
  }, [authReady, authUser, bootSession, phase]);

  const handleAgree = () => {
    if (!guidelinesChecked) return;
    try {
      localStorage.setItem(AGREED_KEY, 'true');
    } catch {
      // Acceptance still applies for this session.
    }
    setHasAgreed(true);
  };

  const resetToLobby = useCallback(() => {
    removeKey(sessionStorage, SESSION_KEY);
    setSession(null);
    setPhase('lobby');
  }, []);

  const handleProfileUpdate = useCallback((profile) => {
    const next = { ...profile, uid: authUser?.uid || profile.uid };
    writeJSON(localStorage, PROFILE_KEY, next);
    setUserProfile(next);
  }, [authUser]);

  const handleMatchStart = (profile, roomId, role) => {
    handleProfileUpdate(profile);
    const next = { roomId, role };
    writeJSON(sessionStorage, SESSION_KEY, next);
    setSession(next);
    setPhase(role === 'user1' ? 'searching' : 'chat');
  };

  const handleMatchFound = useCallback(() => {
    setPhase('chat');
  }, []);

  const handleCancelSearch = useCallback(() => {
    if (session?.roomId && authUser?.uid) {
      // Do not make the student wait on a network write to leave the screen.
      // If this is queued offline, the room still expires on its own.
      leaveRoom(session.roomId, authUser.uid).catch((error) => {
        console.error('Could not leave the waiting room:', error);
      });
    }
    resetToLobby();
  }, [session, authUser, resetToLobby]);

  const handleExitChat = useCallback(() => {
    resetToLobby();
  }, [resetToLobby]);

  const clearProfile = () => {
    removeKey(localStorage, PROFILE_KEY);
    setUserProfile(null);
    resetToLobby();
  };

  const authSetupNeeded = authError?.code === 'auth/operation-not-allowed'
    || authError?.code === 'auth/admin-restricted-operation'
    || authError?.code === 'auth/configuration-not-found';

  if (authError) {
    return (
      <div className="min-h-screen bg-[var(--color-app-bg)] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[var(--color-card-bg)] rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-grc-red mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight">
            {authSetupNeeded ? 'One quick setup step' : 'Connection problem'}
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-2 mb-4 leading-relaxed">
            {authSetupNeeded
              ? 'Enable anonymous guest access in Firebase Console → Authentication → Sign-in method. Students still never see a login or sign-up screen.'
              : 'GRCBuddy could not connect. Check your internet connection and try again.'}
          </p>
          {authSetupNeeded && (
            <p className="text-[10px] text-slate-400 font-mono break-words mb-4">
              {authError.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const booting = !authReady || (!authUser && !authError);

  if (booting || phase === 'resuming') {
    return (
      <div className="min-h-screen bg-[var(--color-app-bg)] flex flex-col items-center justify-center gap-6 px-6">
        <div className="bg-grc-red p-6 rounded-[2rem] shadow-2xl">
          <Heart size={40} color="white" fill="white" />
        </div>
        <div className="h-6 w-6 border-3 border-grc-red/20 border-t-grc-red rounded-full animate-spin" />
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
          Connecting to GRCBuddy...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-app-bg)] font-sans transition-colors duration-300 overflow-x-hidden relative">

      <Toaster position="top-center" />

      {!online && (
        <div
          role="status"
          className="fixed top-0 inset-x-0 z-[200] bg-slate-900 text-white text-[11px] font-bold text-center py-2 px-4"
        >
          You are offline. Messages will send when the connection returns.
        </div>
      )}

      {/* Community Rules Modal */}
      {!hasAgreed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guidelines-title"
            className="bg-[var(--color-card-bg)] w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-pop-in"
          >
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-grc-red mb-6 mx-auto">
              <AlertCircle size={32} />
            </div>

            <h2 id="guidelines-title" className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight text-center">
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
                  checked={guidelinesChecked}
                  onChange={(event) => setGuidelinesChecked(event.target.checked)}
                  className="w-5 h-5 rounded-lg border-2 border-slate-200 dark:border-slate-700 checked:bg-grc-red transition-all appearance-none cursor-pointer relative checked:before:content-['✓'] checked:before:absolute checked:before:text-white checked:before:text-[10px] checked:before:left-1 checked:before:top-0"
                />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  I agree to follow the community guidelines.
                </span>
              </label>

              <button
                onClick={handleAgree}
                disabled={!guidelinesChecked}
                className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                Accept and Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar visible when in Chat mode */}
      {phase === 'chat' && (
        <Navbar isDark={isDark} onToggleTheme={() => setIsDark((value) => !value)} />
      )}

      <main className="w-full h-full flex flex-col">
        {phase === 'lobby' && (
          <Lobby
            userProfile={userProfile}
            onMatchStart={handleMatchStart}
            onLogout={clearProfile}
            isDark={isDark}
            setIsDark={setIsDark}
          />
        )}

        {phase === 'searching' && session && (
          <Matching
            roomId={session.roomId}
            interests={userProfile?.interests}
            onMatchFound={handleMatchFound}
            onCancel={handleCancelSearch}
          />
        )}

        {phase === 'chat' && session && (
          <Chat
            roomId={session.roomId}
            userProfile={userProfile}
            userRole={session.role}
            onExit={handleExitChat}
          />
        )}
      </main>
    </div>
  );
}
