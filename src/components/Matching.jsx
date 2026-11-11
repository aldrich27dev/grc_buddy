import { useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { Search, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { extendWaitingRoom, WAITING_TTL_MS } from '../services/rooms';

export default function Matching({ roomId, interests, onMatchFound, onCancel }) {
  const closedRef = useRef(false);
  const matchedRef = useRef(false);
  const expiresAtRef = useRef(0);

  useEffect(() => {
    let handled = false;
    let matchedTimer = null;

    const finish = (callback) => {
      if (handled) return;
      handled = true;
      callback();
    };

    const expireSearch = () => {
      finish(() => {
        toast.error('Search expired. Please try again.');
        onCancel();
      });
    };

    const heartbeat = () => {
      if (expiresAtRef.current && Date.now() >= expiresAtRef.current) {
        expireSearch();
        return;
      }

      extendWaitingRoom(roomId)
        .then(() => {
          expiresAtRef.current = Date.now() + WAITING_TTL_MS;
        })
        .catch(() => {
          // The room may have just been claimed; the snapshot handles that.
        });
    };

    // Revive a room resumed after a refresh before the first interval fires.
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 60000);
    // Local-only safety check: detects a room that expired while offline or
    // while the browser throttled timers, without extra Firestore reads.
    const expiryTimer = setInterval(() => {
      if (expiresAtRef.current && Date.now() >= expiresAtRef.current) {
        expireSearch();
      }
    }, 15000);

    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (closedRef.current) return;

      if (!snapshot.exists()) {
        finish(() => {
          toast.error('Search expired. Please try again.');
          onCancel();
        });
        return;
      }

      const data = snapshot.data();
      expiresAtRef.current = data.expiresAt?.toMillis?.() ?? 0;

      if (data.status === 'full') {
        matchedRef.current = true;
        finish(() => {
          toast.success('Buddy found! Joining chat...', { duration: 1500 });
          matchedTimer = setTimeout(onMatchFound, 700);
        });
      } else if (data.status === 'ended') {
        finish(() => {
          toast('Search ended.', { icon: 'ℹ️' });
          onCancel();
        });
      }
    }, (error) => {
      if (closedRef.current) return;
      console.error('Waiting room connection lost:', error);
      finish(() => {
        if (error?.code === 'permission-denied') {
          toast.error('Firestore blocked the search. Deploy the security rules, then try again.');
        } else {
          toast.error('Connection lost while searching. Please try again.');
        }
        onCancel();
      });
    });

    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(expiryTimer);
      if (matchedTimer) clearTimeout(matchedTimer);
      unsubscribe();
    };
  }, [roomId, onMatchFound, onCancel]);

  const handleCancel = () => {
    // A match may already be on its way in. Do not end the room underneath it.
    if (matchedRef.current) return;
    closedRef.current = true;
    onCancel();
  };

  const displayInterests = interests || [];

  return (
    <div className="fixed inset-0 bg-grc-red flex flex-col items-center justify-center text-white p-8 overflow-hidden z-[1000]">

      {/* Animated Background Pulse */}
      <div className="absolute inset-0 z-0 opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white rounded-full animate-ping duration-[4s]" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
        {/* Loading Icon */}
        <div className="relative mb-10">
          <div className="bg-white/10 p-8 rounded-full backdrop-blur-md border border-white/20 shadow-2xl">
            <Loader2 size={48} className="animate-spin text-white" />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-white text-grc-red p-3 rounded-2xl shadow-xl animate-bounce">
            <Search size={24} />
          </div>
        </div>

        <h2 className="text-4xl font-black mb-2 tracking-tighter italic" role="status" aria-live="polite">
          Searching...
        </h2>
        <p className="text-red-100 font-medium mb-10 opacity-90 text-xs uppercase tracking-widest">
          Looking for students with same interests
        </p>

        {/* Interests Tags */}
        <div className="flex flex-wrap justify-center gap-3 mb-14 px-4">
          {displayInterests.length > 0 ? (
            displayInterests.map((topic, index) => (
              <div
                key={index}
                className="bg-white text-grc-red px-6 py-2.5 rounded-[1.2rem] font-black text-sm shadow-2xl shadow-red-900/40 transition-all hover:-translate-y-1 animate-pop-in"
              >
                {topic}
              </div>
            ))
          ) : (
            <div className="animate-pulse text-white/50 text-xs font-bold uppercase tracking-widest">
              Picking topics...
            </div>
          )}
        </div>

        <button
          onClick={handleCancel}
          type="button"
          aria-label="Cancel search"
          className="group flex flex-col items-center gap-3 outline-none focus:ring-2 focus:ring-white/50 rounded-2xl p-4 transition-all"
        >
          <span className="text-[11px] font-black uppercase tracking-[0.3em] opacity-70 group-hover:opacity-100 transition-opacity">
            Cancel Search
          </span>
          <div className="h-1.5 w-10 bg-white/30 rounded-full group-hover:bg-white/100 group-hover:w-16 transition-all duration-300" />
        </button>
      </div>

      {/* College Branding Footer */}
      <div className="absolute bottom-10 flex flex-col items-center gap-2 opacity-60">
        <div className="h-px w-20 bg-white/30" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-center">
          <span className="font-medium opacity-80">aldrich27dev</span>
        </p>
      </div>
    </div>
  );
}
