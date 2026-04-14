import React, { useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Search, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Matching({ roomId, userRole, interests, onMatchFound, onCancel, formData }) {
  
  useEffect(() => {
    // Listen for changes in the room document
    const unsub = onSnapshot(doc(db, "rooms", roomId), (snap) => {
      if (!snap.exists()) {
        onCancel(); 
        return; 
      }
      
      const data = snap.data();
      
      // LOGIC: If I am User 2 and the room is still waiting, I "claim" the spot
      if (userRole === 'user2' && data.status === 'waiting') {
        updateDoc(doc(db, "rooms", roomId), {
          user2: formData.name,
          user2Course: formData.course,
          user2Year: formData.year,
          user2Gender: formData.gender, // Added to ensure gender carries over
          status: 'full'
        });
      }

      // If the room status changes to 'full', transition to Chat
      if (data.status === 'full') {
        toast.success("Buddy found! Joining chat...", { duration: 1500 });
        setTimeout(onMatchFound, 1000);
      }
    });

    return () => unsub();
  }, [roomId, userRole, formData, onMatchFound, onCancel]);

  // Safely handle display interests
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

        <h2 className="text-4xl font-black mb-2 tracking-tighter italic">Searching...</h2>
        <p className="text-red-100 font-medium mb-10 opacity-90 text-xs uppercase tracking-widest">
          Looking for students with same interests
        </p>  
        
        {/* Interests Tags - Plural and Safely Mapped */}
        <div className="flex flex-wrap justify-center gap-3 mb-14 px-4">
          {displayInterests.length > 0 ? (
            displayInterests.map((topic, index) => (
              <div 
                key={index}
                className="bg-white text-grc-red px-6 py-2.5 rounded-[1.2rem] font-black text-sm shadow-2xl shadow-red-900/40 transition-all hover:-translate-y-1 animate-in fade-in zoom-in duration-300"
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
          onClick={onCancel} 
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