import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  StopCircle,
  X,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { auth, ensureSignedIn } from '../firebase/auth';
import { formatPeso } from '../constants/shoutouts';
import { listenActiveShoutouts } from '../services/shoutouts';
import {
  approveShoutoutRequest,
  isShoutoutAdmin,
  listenPendingShoutouts,
  rejectShoutoutRequest,
  stopShoutout,
} from '../services/shoutoutAdmin';

function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value?.toDate === 'function') return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StateCard({ icon, title, children }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--color-card-bg)] rounded-[2.5rem] p-7 shadow-2xl border border-slate-100 dark:border-slate-800 text-center">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-grc-red mx-auto mb-5">
          {icon}
        </div>
        <h1 className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

export default function ShoutoutAdmin() {
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [uid, setUid] = useState(null);
  const [adminState, setAdminState] = useState('checking');
  const [checkVersion, setCheckVersion] = useState(0);
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    document.title = 'GRCBuddy Shoutout Admin';

    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);

    try {
      if (localStorage.getItem('grc_theme') === 'dark') {
        document.documentElement.classList.add('dark');
      }
    } catch {
      // Theme is optional on the admin page.
    }

    return () => {
      document.title = 'GRCBuddy';
      robots.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!mounted) return;
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });

    ensureSignedIn().catch((error) => {
      if (!mounted) return;
      console.error('Admin sign-in failed:', error);
      setAuthError(error);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !uid || authError) return undefined;

    let mounted = true;

    isShoutoutAdmin(uid)
      .then((authorized) => {
        if (mounted) setAdminState(authorized ? 'admin' : 'denied');
      })
      .catch((error) => {
        if (!mounted) return;
        console.error('Could not check admin access:', error);
        setAdminState('error');
      });

    return () => {
      mounted = false;
    };
  }, [authReady, uid, authError, checkVersion]);

  useEffect(() => {
    if (adminState !== 'admin') return undefined;

    return listenPendingShoutouts(
      (shoutouts) => {
        setPending(
          [...shoutouts].sort(
            (first, second) => (
              (second.createdAt?.toMillis?.() ?? 0) - (first.createdAt?.toMillis?.() ?? 0)
            )
          )
        );
      },
      (error) => {
        console.error('Could not load pending shoutouts:', error);
        toast.error('Could not load pending requests.');
      }
    );
  }, [adminState]);

  useEffect(() => {
    if (adminState !== 'admin') return undefined;

    return listenActiveShoutouts(
      setActive,
      (error) => {
        console.error('Could not load active shoutouts:', error);
      }
    );
  }, [adminState]);

  const retryCheck = () => {
    setAdminState('checking');
    setCheckVersion((version) => version + 1);
  };

  const copyDeviceId = async () => {
    if (!uid) return;

    if (!navigator.clipboard?.writeText) {
      toast.error('Copy is unavailable. Select the ID manually.');
      return;
    }

    try {
      await navigator.clipboard.writeText(uid);
      toast.success('Device ID copied.');
    } catch {
      toast.error('Could not copy. Select the ID manually.');
    }
  };

  const handleApprove = async (request) => {
    if (busyId) return;
    setBusyId(request.id);

    try {
      const result = await approveShoutoutRequest(request);
      const scheduled = result.startsAt > Date.now() + 1000;
      toast.success(
        scheduled
          ? `Scheduled for ${formatDateTime(result.startsAt)}.`
          : `Approved. Live until ${formatDateTime(result.endsAt)}.`
      );
    } catch (error) {
      console.error('Could not approve shoutout:', error);
      toast.error('Could not approve this request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (request) => {
    if (busyId || !window.confirm('Reject this shoutout request?')) return;
    setBusyId(request.id);

    try {
      await rejectShoutoutRequest(request.id);
      toast.success('Request rejected.');
    } catch (error) {
      console.error('Could not reject shoutout:', error);
      toast.error('Could not reject this request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStop = async (shoutout) => {
    if (busyId || !window.confirm('Stop this banner now?')) return;
    setBusyId(shoutout.id);

    try {
      await stopShoutout(shoutout.id);
      toast.success('Banner stopped.');
    } catch (error) {
      console.error('Could not stop shoutout:', error);
      toast.error('Could not stop this banner.');
    } finally {
      setBusyId(null);
    }
  };

  let content;

  if (authError) {
    content = (
      <StateCard icon={<AlertCircle size={30} />} title="Connection problem">
        <p className="text-xs text-slate-500 font-bold mt-2 mb-5 leading-relaxed">
          The admin page could not connect to Firebase. Check your internet
          connection, then try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
        >
          Retry
        </button>
      </StateCard>
    );
  } else if (!authReady || adminState === 'checking' || !uid) {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        <div className="bg-grc-red p-5 rounded-[1.75rem] shadow-2xl">
          <ShieldCheck size={32} color="white" />
        </div>
        <div className="h-7 w-7 border-4 border-grc-red/20 border-t-grc-red rounded-full animate-spin" />
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
          Checking this device...
        </p>
      </div>
    );
  } else if (adminState === 'error') {
    content = (
      <StateCard icon={<AlertCircle size={30} />} title="Could not check device">
        <p className="text-xs text-slate-500 font-bold mt-2 mb-5 leading-relaxed">
          The admin list could not be checked. This is usually a temporary
          connection problem.
        </p>
        <button
          onClick={retryCheck}
          className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
        >
          Try again
        </button>
      </StateCard>
    );
  } else if (adminState === 'denied') {
    content = (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--color-card-bg)] rounded-[2.5rem] p-7 shadow-2xl border border-slate-100 dark:border-slate-800">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center text-amber-500 mx-auto mb-5">
            <Smartphone size={30} />
          </div>
          <h1 className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight text-center">
            Authorize this device
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-2 mb-5 text-center leading-relaxed">
            This page is only for shoutout approvals. Add this device ID to the
            admin list once, then it works without a password.
          </p>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
              Device ID
            </p>
            <p
              data-testid="admin-device-id"
              className="text-[11px] font-mono font-bold text-[var(--color-main-text)] mt-2 break-all"
            >
              {uid}
            </p>
            <button
              onClick={copyDeviceId}
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 active:scale-[0.98] transition-all"
            >
              <Copy size={13} /> Copy device ID
            </button>
          </div>

          <div className="mt-5 space-y-3 text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              One-time setup
            </p>
            <ol className="space-y-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed list-decimal list-inside">
              <li>Open Firebase Console → Firestore Database.</li>
              <li>Create a collection named <span className="font-mono text-grc-red">admins</span>.</li>
              <li>Use the device ID above as the document ID. Save it.</li>
              <li>Come back and tap the retry button below.</li>
            </ol>
          </div>

          <button
            onClick={retryCheck}
            className="mt-5 w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all shadow-lg"
          >
            I added it — retry
          </button>

          <a
            href="./"
            className="mt-4 w-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"
          >
            <ExternalLink size={12} /> Back to GRCBuddy
          </a>
        </div>
      </div>
    );
  } else {
    const currentTime = Date.now();

    content = (
      <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-12">
        <header className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-grc-red flex items-center justify-center text-white shadow-lg shadow-red-200 dark:shadow-none shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
              GRCBuddy
            </p>
            <h1 className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight">
              Shoutout admin
            </h1>
          </div>
          <button
            onClick={retryCheck}
            aria-label="Refresh admin access"
            className="ml-auto w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
          >
            <RefreshCw size={16} />
          </button>
        </header>

        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30">
          <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-[9px] font-black uppercase tracking-widest text-green-700 dark:text-green-400">
            Authorized device
          </p>
          <p className="ml-auto text-[9px] font-mono font-bold text-green-700/60 dark:text-green-400/60">
            {uid.slice(0, 8)}…
          </p>
        </div>

        <section className="mt-7">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-black text-[var(--color-main-text)] uppercase tracking-tight">
                Pending requests
              </h2>
              <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                Confirm the payment on Telegram before approving.
              </p>
            </div>
            <span className="min-w-7 h-7 px-2 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px] font-black flex items-center justify-center">
              {pending.length}
            </span>
          </div>

          {pending.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 p-7 text-center">
              <Clock3 size={22} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                No pending requests
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                New requests appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((request) => (
                <article
                  key={request.id}
                  className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-[var(--color-card-bg)] p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
                        Pending payment
                      </p>
                      <p className="text-sm font-bold text-[var(--color-main-text)] mt-1.5 break-words">
                        “{request.text}”
                      </p>
                    </div>
                    <p className="text-lg font-black text-grc-red shrink-0">
                      {formatPeso(request.price)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      {request.durationLabel}
                    </span>
                    <span>by {request.senderName}</span>
                  </div>

                  <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                      Requested slot
                    </p>
                    <p className="text-[10px] font-bold text-[var(--color-main-text)] mt-1">
                      {formatDateTime(request.requestedStartAt)} – {formatDateTime(request.requestedEndAt)}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 mt-1">
                      Requested {formatDateTime(request.createdAt)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => handleApprove(request)}
                      disabled={Boolean(busyId)}
                      className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-green-600 text-white text-[9px] font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
                    >
                      <Check size={14} strokeWidth={3} />
                      {busyId === request.id ? 'Approving...' : 'Approve & post'}
                    </button>
                    <button
                      onClick={() => handleReject(request)}
                      disabled={Boolean(busyId)}
                      className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
                    >
                      <X size={14} strokeWidth={3} />
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-black text-[var(--color-main-text)] uppercase tracking-tight">
                Active & scheduled
              </h2>
              <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                Only one banner is shown at a time.
              </p>
            </div>
            <span className="min-w-7 h-7 px-2 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[10px] font-black flex items-center justify-center">
              {active.length}
            </span>
          </div>

          {active.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 p-7 text-center">
              <Megaphone size={22} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                No active banner
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                Approved requests will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map((shoutout) => {
                const startsAtMs = shoutout.startsAt?.toMillis?.() ?? 0;
                const scheduled = startsAtMs > currentTime;

                return (
                  <article
                    key={shoutout.id}
                    className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-[var(--color-card-bg)] p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-[8px] font-black uppercase tracking-[0.18em] ${
                          scheduled
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}>
                          {scheduled ? 'Scheduled' : 'Live now'}
                        </p>
                        <p className="text-sm font-bold text-[var(--color-main-text)] mt-1.5 break-words">
                          “{shoutout.text}”
                        </p>
                      </div>
                      <button
                        onClick={() => handleStop(shoutout)}
                        disabled={Boolean(busyId)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-grc-red text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 shrink-0"
                      >
                        <StopCircle size={12} />
                        Stop
                      </button>
                    </div>

                    <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2">
                      {shoutout.senderName} • {shoutout.durationLabel} • {formatPeso(shoutout.price)}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 mt-1">
                      {scheduled ? 'Starts' : 'Started'} {formatDateTime(shoutout.startsAt)} • Ends {formatDateTime(shoutout.endsAt)}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="text-[8px] font-bold text-slate-400 font-mono">
            Authorized device • {uid.slice(0, 10)}…
          </p>
          <a
            href="./"
            className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-grc-red"
          >
            <ExternalLink size={11} /> Open GRCBuddy
          </a>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-app-bg)] text-[var(--color-main-text)] font-sans flex flex-col transition-colors duration-300">
      <Toaster position="top-center" />
      {content}
    </div>
  );
}
