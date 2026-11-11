import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Megaphone } from 'lucide-react';
import { listenActiveShoutouts } from '../services/shoutouts';

const CLOCK_TICK_MS = 15000;

export default function ShoutoutBanner({ variant = 'lobby', onBook }) {
  const [shoutouts, setShoutouts] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubscribe = listenActiveShoutouts(
      (nextShoutouts) => {
        setShoutouts(nextShoutouts);
        setNow(Date.now());
      },
      (error) => {
        // A missing index or an offline connection must not break the app.
        console.error('Shoutout banner connection lost:', error);
        setShoutouts([]);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const current = useMemo(() => {
    const showing = shoutouts
      .filter((shoutout) => {
        const startsAt = shoutout.startsAt?.toMillis?.() ?? 0;
        const endsAt = shoutout.endsAt?.toMillis?.() ?? 0;
        return startsAt <= now && endsAt > now;
      })
      .sort((first, second) => (
        (first.startsAt?.toMillis?.() ?? 0) - (second.startsAt?.toMillis?.() ?? 0)
      ));

    return showing[0] || null;
  }, [shoutouts, now]);

  const compact = variant === 'chat';

  return (
    <div className={compact ? 'shrink-0 px-3 pb-2' : 'w-full mb-6'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-red-100 dark:border-red-900/30 bg-gradient-to-r from-red-50 via-white to-white dark:from-red-900/20 dark:via-slate-800 dark:to-slate-800 px-3 py-2.5 md:px-4 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-grc-red text-white flex items-center justify-center shrink-0 shadow-md shadow-red-200 dark:shadow-none">
          <Megaphone size={15} strokeWidth={2.5} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black text-grc-red uppercase tracking-[0.18em] leading-none">
              Shoutout
            </span>
          </div>

          {current ? (
            <div key={current.id} className="animate-fade-in">
              <p className="text-[11px] md:text-xs font-bold text-[var(--color-main-text)] leading-snug whitespace-normal break-words">
                {current.text}
              </p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider break-words">
                — {current.senderName || 'GRC Student'}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[11px] md:text-xs font-bold text-[var(--color-main-text)] leading-snug whitespace-normal break-words">
                Your shoutout could be here
              </p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider break-words">
                From ₱25 • lobby and chat banner
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onBook}
          className="order-last w-full sm:order-none sm:w-auto flex items-center justify-center gap-1 rounded-xl bg-grc-red text-white px-3 py-2 text-[9px] font-black uppercase tracking-widest hover:brightness-95 active:scale-95 transition-all shadow-md shadow-red-200 dark:shadow-none shrink-0"
        >
          {current ? 'Book yours' : 'Book now'}
          <ChevronRight size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
