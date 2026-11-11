import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Megaphone,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../firebase/auth';
import { readJSON, removeKey, writeJSON } from '../lib/storage';
import {
  SHOUTOUT_DURATIONS,
  SHOUTOUT_TEXT_MAX,
  SHOUTOUT_TEXT_MIN,
  buildPaymentMessage,
  formatPeso,
  getShoutoutDuration,
  getShoutoutTelegramUrl,
} from '../constants/shoutouts';
import {
  cleanShoutoutText,
  createShoutoutRequest,
  getLatestOpenShoutout,
  getQueueEndsAt,
  getShoutout,
  listenActiveShoutouts,
} from '../services/shoutouts';

const SHOUTOUT_REQUEST_KEY = 'grc_shoutout_request';

function formatTime(dateLike) {
  if (!dateLike) return '';
  const date = typeof dateLike?.toDate === 'function'
    ? dateLike.toDate()
    : new Date(dateLike);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ShoutoutModal({ open, onClose, userProfile }) {
  const [text, setText] = useState('');
  const [durationId, setDurationId] = useState(SHOUTOUT_DURATIONS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [statusShoutout, setStatusShoutout] = useState(null);
  const [formError, setFormError] = useState('');
  const [activeShoutouts, setActiveShoutouts] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const textareaRef = useRef(null);

  const selectedDuration = getShoutoutDuration(durationId) || SHOUTOUT_DURATIONS[0];

  const loadMyStatus = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    // Yield once so the initial status check never sets state synchronously
    // from inside the open effect.
    await Promise.resolve();

    if (!uid) {
      setChecking(false);
      return;
    }

    try {
      const saved = readJSON(localStorage, SHOUTOUT_REQUEST_KEY);
      if (!saved?.id) {
        setStatusShoutout(null);
        return;
      }

      const request = await getShoutout(saved.id);
      if (!request || request.senderId !== uid) {
        removeKey(localStorage, SHOUTOUT_REQUEST_KEY);
        setStatusShoutout(null);
        return;
      }

      const openRequest = getLatestOpenShoutout([request]);
      setStatusShoutout(openRequest);

      if (!openRequest) {
        removeKey(localStorage, SHOUTOUT_REQUEST_KEY);
      }
    } catch (error) {
      console.error('Could not load shoutout request:', error);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const statusTimer = setTimeout(loadMyStatus, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(statusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, loadMyStatus]);

  useEffect(() => {
    if (!open) return undefined;

    const unsubscribe = listenActiveShoutouts(
      setActiveShoutouts,
      (error) => {
        console.error('Could not check shoutout availability:', error);
        setActiveShoutouts([]);
      }
    );
    const timer = setInterval(() => setNow(Date.now()), 30000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || checking || statusShoutout) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open, checking, statusShoutout]);

  if (!open) return null;

  const isActive = statusShoutout?.status === 'active';
  const isPending = statusShoutout?.status === 'pending';
  const startsAtMs = statusShoutout?.startsAt?.toMillis?.() ?? 0;
  const isScheduled = isActive && startsAtMs > now;
  const nextAvailableAt = getQueueEndsAt(activeShoutouts, now);
  const queueIsBusy = nextAvailableAt > now + 1000;
  const nextAvailableEnd = nextAvailableAt + selectedDuration.durationMs;
  const requestDuration = statusShoutout
    ? getShoutoutDuration(statusShoutout.durationId)
    : null;
  const requestPrice = statusShoutout?.price ?? requestDuration?.price ?? 0;
  const requestDurationLabel = statusShoutout?.durationLabel || requestDuration?.label || '';
  const requestSlot = statusShoutout?.requestedStartAt && statusShoutout?.requestedEndAt
    ? `${formatTime(statusShoutout.requestedStartAt)} – ${formatTime(statusShoutout.requestedEndAt)}`
    : '';

  const paymentMessage = statusShoutout
    ? buildPaymentMessage({
      requestId: statusShoutout.id,
      text: statusShoutout.text,
      duration: { label: requestDurationLabel },
      price: requestPrice,
      slot: requestSlot,
    })
    : '';
  const telegramUrl = statusShoutout ? getShoutoutTelegramUrl(paymentMessage) : '';
  const cleanedText = cleanShoutoutText(text);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (cleanedText.length < SHOUTOUT_TEXT_MIN) {
      setFormError(`Write at least ${SHOUTOUT_TEXT_MIN} characters for your banner.`);
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setFormError('Still connecting. Please try again in a moment.');
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      const created = await createShoutoutRequest({
        uid,
        profile: userProfile,
        text: cleanedText,
        durationId,
        requestedStartAt: nextAvailableAt,
      });

      writeJSON(localStorage, SHOUTOUT_REQUEST_KEY, { id: created.id });
      setStatusShoutout({
        id: created.id,
        text: created.text,
        durationId: created.duration.id,
        durationLabel: created.duration.label,
        price: created.price,
        status: 'pending',
        requestedStartAt: created.requestedStartAt,
        requestedEndAt: created.requestedEndAt,
      });
      toast.success('Shoutout request saved!');
    } catch (error) {
      console.error('Could not create shoutout request:', error);
      if (error?.code === 'permission-denied') {
        setFormError('Shoutout requests are not available yet. Please try again later.');
      } else if (error?.code === 'resource-exhausted') {
        setFormError("Today's free limit was reached. Please try again tomorrow.");
      } else {
        setFormError("Your request couldn't be saved. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyRequestId = async () => {
    if (!statusShoutout?.id) return;
    try {
      await navigator.clipboard.writeText(statusShoutout.id);
      toast.success('Request ID copied');
    } catch {
      toast.error('Could not copy the request ID.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end md:items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shoutout-title"
        className="relative w-full md:max-w-md max-h-[92dvh] overflow-y-auto bg-[var(--color-card-bg)] rounded-t-[2rem] md:rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 animate-slide-up md:animate-pop-in"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shoutout form"
          className="absolute top-4 right-4 z-10 p-2 rounded-xl text-slate-400 hover:text-grc-red hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <X size={18} />
        </button>

        <div className="p-6 md:p-7">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-grc-red mb-5">
            <Megaphone size={28} />
          </div>

          <h2 id="shoutout-title" className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight">
            {isScheduled
              ? 'Shoutout scheduled'
              : isActive
                ? 'Your shoutout is live'
                : isPending
                  ? 'Waiting for approval'
                  : 'Book a shoutout'}
          </h2>
          <p className="text-[11px] text-slate-500 font-bold mt-1 mb-5 leading-relaxed">
            {isScheduled
              ? `Your banner is queued from ${formatTime(statusShoutout.startsAt || statusShoutout.requestedStartAt)} to ${formatTime(statusShoutout.endsAt || statusShoutout.requestedEndAt)}.`
              : isActive
                ? 'Your message is showing on the lobby and chat banners.'
                : isPending
                  ? 'Send your payment on Telegram. Your banner goes live after it is verified.'
                  : 'Put your message on GRCBuddy’s lobby and chat banners.'}
          </p>

          {checking && !statusShoutout && (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <div className="h-5 w-5 border-2 border-grc-red/20 border-t-grc-red rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">Checking your requests...</span>
            </div>
          )}

          {!checking && statusShoutout && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
                isActive
                  ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30'
                  : 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30'
              }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isActive
                    ? 'bg-green-500 text-white'
                    : 'bg-amber-400 text-white'
                }`}>
                  {isActive ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                </div>
                <div className="min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${
                    isActive ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    {isScheduled ? 'Scheduled banner' : isActive ? 'Active banner' : 'Pending payment'}
                  </p>
                  <p className="text-xs font-bold text-[var(--color-main-text)] mt-1 break-words">
                    “{statusShoutout.text}”
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">
                    {requestDurationLabel} • {formatPeso(requestPrice)}
                  </p>
                  {isActive && (
                    <p className="text-[10px] font-bold text-green-600 dark:text-green-400 mt-1">
                      {isScheduled
                        ? `Starts ${formatTime(statusShoutout.startsAt || statusShoutout.requestedStartAt)} • Ends ${formatTime(statusShoutout.endsAt || statusShoutout.requestedEndAt)}`
                        : `Until ${formatTime(statusShoutout.endsAt)}`}
                    </p>
                  )}
                  {isPending && statusShoutout.requestedStartAt && (
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                      Requested slot: {formatTime(statusShoutout.requestedStartAt)} – {formatTime(statusShoutout.requestedEndAt)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="min-w-0">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Request ID</p>
                  <p className="text-[11px] font-mono font-bold text-[var(--color-main-text)] truncate">
                    {statusShoutout.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyRequestId}
                  aria-label="Copy request ID"
                  className="p-2 rounded-lg text-slate-400 hover:text-grc-red hover:bg-white dark:hover:bg-slate-700 transition-all shrink-0"
                >
                  <Copy size={15} />
                </button>
              </div>

              {isPending && (
                <>
                  {telegramUrl ? (
                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all shadow-lg shadow-red-200 dark:shadow-none"
                    >
                      <Send size={15} /> Pay {formatPeso(requestPrice)} on Telegram
                    </a>
                  ) : (
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 text-center">
                      The payment link is not configured yet.
                    </p>
                  )}

                  <p className="text-[9px] text-slate-400 font-bold text-center leading-relaxed">
                    Keep your request ID. The owner checks the payment manually, then activates the banner.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setChecking(true);
                      loadMyStatus();
                    }}
                    disabled={checking}
                    className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> Refresh status
                  </button>
                </>
              )}

              {isActive && (
                <button
                  type="button"
                  onClick={() => {
                    removeKey(localStorage, SHOUTOUT_REQUEST_KEY);
                    setStatusShoutout(null);
                    setText('');
                    setDurationId(SHOUTOUT_DURATIONS[0].id);
                    setFormError('');
                  }}
                  className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all shadow-lg shadow-red-200 dark:shadow-none"
                >
                  Book another shoutout
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-grc-red transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {!checking && !statusShoutout && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <label htmlFor="shoutout-text" className="text-[9px] font-black text-grc-red uppercase tracking-widest">
                    Banner text
                  </label>
                  <span className="text-[9px] font-black text-slate-400">
                    {text.length}/{SHOUTOUT_TEXT_MAX}
                  </span>
                </div>
                <textarea
                  id="shoutout-text"
                  ref={textareaRef}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    if (formError) setFormError('');
                  }}
                  maxLength={SHOUTOUT_TEXT_MAX}
                  rows={3}
                  placeholder="Happy birthday, BSIT 2-A! Keep going, future IT pros."
                  className="w-full p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl outline-none border-2 border-transparent focus:border-grc-red focus:bg-[var(--color-card-bg)] transition-all text-sm font-medium text-[var(--color-main-text)] resize-none"
                />
              </div>

              <div>
                <p className="text-[9px] font-black text-grc-red uppercase tracking-widest mb-2 px-1">
                  How long should it show?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SHOUTOUT_DURATIONS.map((duration) => {
                    const selected = duration.id === durationId;
                    return (
                      <button
                        key={duration.id}
                        type="button"
                        onClick={() => setDurationId(duration.id)}
                        aria-pressed={selected}
                        className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? 'border-grc-red bg-grc-red text-white shadow-md'
                            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 text-[var(--color-main-text)] hover:border-slate-200'
                        }`}
                      >
                        <span className={`block text-[8px] font-black uppercase tracking-widest ${
                          selected ? 'text-white/70' : 'text-slate-400'
                        }`}>
                          {duration.label}
                        </span>
                        <span className="block text-sm font-black mt-0.5">{formatPeso(duration.price)}</span>
                        {selected && (
                          <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                            <Check size={10} strokeWidth={4} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
                queueIsBusy
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30'
                  : 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30'
              }`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 ${
                  queueIsBusy ? 'bg-amber-400' : 'bg-green-500'
                }`}>
                  <Clock3 size={15} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${
                    queueIsBusy ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {queueIsBusy ? 'Your shoutout is queued' : 'This time is available'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {queueIsBusy ? (
                      <>
                        Another shoutout is using the banner now. Your shoutout
                        will be posted on{' '}
                        <span className="font-black text-amber-700 dark:text-amber-300">
                          {formatTime(nextAvailableAt)}
                        </span>{' '}
                        and will stay up until {formatTime(nextAvailableEnd)}.
                      </>
                    ) : 'Your banner can start as soon as your payment is approved.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                  <p className="text-[10px] font-bold text-slate-500">
                    {selectedDuration.label} on the banner
                  </p>
                </div>
                <p className="text-2xl font-black text-grc-red">{formatPeso(selectedDuration.price)}</p>
              </div>

              {formError && (
                <p role="alert" className="text-[10px] font-bold text-grc-red bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || cleanedText.length < SHOUTOUT_TEXT_MIN}
                className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all shadow-lg shadow-red-200 dark:shadow-none disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Request &amp; pay {formatPeso(selectedDuration.price)} <Send size={14} /></>
                )}
              </button>

              <p className="text-[9px] text-slate-400 font-bold text-center leading-relaxed">
                Payment is verified manually on Telegram. The banner starts after approval and expires automatically.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
