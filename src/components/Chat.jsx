import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Send, User, LogOut, Mars, Venus, AlertCircle, MapPin, CheckCheck, Reply, X } from 'lucide-react';

export default function Chat({ roomId, userProfile, userRole, onExit }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [partner, setPartner] = useState({ name: 'Waiting...', course: '', gender: '', location: '', typing: false });
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  
  // NEW STATES FOR REPLY FEATURE
  const [replyTo, setReplyTo] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState({ id: null, x: 0 });
  
  const scrollRef = useRef(null);

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // SWIPE HANDLERS FOR MOBILE
  const handleTouchStart = (e, msg) => {
    if (partnerLeft) return;
    setSwipeOffset({ id: msg.id, x: e.touches[0].clientX });
  };

  const handleTouchMove = (e, msg) => {
    if (swipeOffset.id !== msg.id) return;
    const deltaX = e.touches[0].clientX - swipeOffset.x;
    if (deltaX > 0 && deltaX < 60) {
      const el = document.getElementById(`msg-container-${msg.id}`);
      if (el) el.style.transform = `translateX(${deltaX}px)`;
    }
  };

  const handleTouchEnd = (e, msg) => {
    const deltaX = e.changedTouches[0].clientX - swipeOffset.x;
    const el = document.getElementById(`msg-container-${msg.id}`);
    if (el) el.style.transform = `translateX(0px)`;
    if (deltaX > 45) setReplyTo(msg);
    setSwipeOffset({ id: null, x: 0 });
  };

  useEffect(() => {
    if (messages.length > 0 && !partnerLeft) {
      const unseenMessages = messages.filter(m => m.user !== userProfile.name && !m.seen);
      if (unseenMessages.length > 0) {
        unseenMessages.forEach(async (msg) => {
          const msgRef = doc(db, "rooms", roomId, "messages", msg.id);
          await updateDoc(msgRef, { seen: true });
        });
      }
    }
  }, [messages, roomId, userProfile.name, partnerLeft]);

  useEffect(() => {
    const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
    const unsubMsgs = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(scrollToBottom, 100);
    });

    const unsubRoom = onSnapshot(doc(db, "rooms", roomId), (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === 'ended') setPartnerLeft(true);
      
      let currentRole = userRole;
      if (!currentRole) {
        if (data.user1 === userProfile.name) currentRole = 'user1';
        else if (data.user2 === userProfile.name) currentRole = 'user2';
      }

      const isUser1 = currentRole === 'user1';
      const pName = isUser1 ? data.user2 : data.user1;
      const pCourse = isUser1 ? data.user2Course : data.user1Course;
      const pGender = isUser1 ? data.user2Gender : data.user1Gender;
      const pLocation = isUser1 ? data.user2Location : data.user1Location;
      const isTyping = isUser1 ? !!data.typing2 : !!data.typing1;

      if (pName) {
        setPartner({ 
          name: pName, 
          course: pCourse || 'GRC Student',
          gender: pGender || '', 
          location: pLocation || '',
          typing: isTyping 
        });
      }
    });

    return () => { unsubMsgs(); unsubRoom(); };
  }, [roomId, userRole, userProfile.name]);

  useEffect(scrollToBottom, [messages, partner.typing, partnerLeft]);

  useEffect(() => {
    const handleTabClose = () => {
      const roomRef = doc(db, "rooms", roomId);
      updateDoc(roomRef, { 
        status: 'ended',
        [`typing${userRole === 'user1' ? '1' : '2'}`]: false 
      });
    };
    window.addEventListener('beforeunload', handleTabClose);
    return () => window.removeEventListener('beforeunload', handleTabClose);
  }, [roomId, userRole]);

  const handleTyping = (val) => {
    if (partnerLeft) return;
    setInputText(val);
    const typingField = userRole === 'user1' ? 'typing1' : 'typing2';
    updateDoc(doc(db, "rooms", roomId), { [typingField]: val.length > 0 });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || partnerLeft) return;
    
    const text = inputText;
    const currentReply = replyTo; // Capture current reply state
    setInputText('');
    setReplyTo(null); // Clear reply preview
    
    const typingField = userRole === 'user1' ? 'typing1' : 'typing2';
    updateDoc(doc(db, "rooms", roomId), { [typingField]: false });

    await addDoc(collection(db, "rooms", roomId, "messages"), {
      text,
      user: userProfile.name,
      course: userProfile.course,
      createdAt: serverTimestamp(),
      reaction: null,
      seen: false,
      // ADDED: Reply Data
      replyTo: currentReply ? { text: currentReply.text, user: currentReply.user } : null
    });
  };

  const addReaction = async (msgId, emoji) => {
    if (partnerLeft) return;
    const msgRef = doc(db, "rooms", roomId, "messages", msgId);
    await updateDoc(msgRef, { reaction: emoji });
    setActiveMessageId(null); 
  };

  const handleExitChat = async () => {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, { status: 'ended' });
    onExit();
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-72px)] bg-[var(--color-app-bg)] transition-colors duration-300 overflow-hidden relative">
      
      {/* EXIT MODAL */}
      {showExitModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-card-bg)] w-full max-w-xs rounded-[2rem] p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-grc-red mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-lg font-black text-[var(--color-main-text)] uppercase tracking-tight">End this chat?</h3>
            <p className="text-xs text-slate-500 font-bold mt-2">You will be disconnected from your buddy.</p>
            <div className="flex flex-col gap-2 mt-6">
              <button onClick={handleExitChat} className="w-full py-3 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Yes, Leave</button>
              <button onClick={() => setShowExitModal(false)} className="w-full py-3 text-slate-500 dark:text-slate-400 font-bold uppercase text-xs tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto bg-[var(--color-card-bg)] md:rounded-t-[2.5rem] md:shadow-2xl overflow-hidden border-x border-slate-100 dark:border-slate-800 relative">
        
        {/* Header */}
        <div className="shrink-0 sticky top-0 z-20 bg-[var(--color-card-bg)] px-4 md:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 overflow-hidden flex-1">
            <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-grc-red relative shrink-0">
              <User size={20} />
              {partner?.gender && (
                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full w-4 h-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center z-10">
                  {partner.gender === 'Male' ? <Mars size={10} strokeWidth={3} className="text-blue-500" /> : <Venus size={10} strokeWidth={3} className="text-pink-500" />}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-[var(--color-main-text)] leading-none truncate">{partner?.name}</p>
                {partner?.gender && (
                  <span className={`inline-block shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter ${partner.gender === 'Male' ? 'bg-blue-50 text-blue-500 dark:bg-blue-900/20' : 'bg-pink-50 text-pink-500 dark:bg-pink-900/20'}`}>
                    {partner.gender}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1 opacity-60">
                <MapPin size={8} className="text-slate-400" />
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate">
                   {partner?.course} from {partner?.location || 'GRC'}
                </p>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-4 min-w-[60px]">
            <p className="text-[9px] font-black text-grc-red uppercase tracking-widest">Topic</p>
            <p className="text-xs font-bold text-[var(--color-main-text)] opacity-80 truncate max-w-[70px] md:max-w-none">{userProfile?.interest || 'General'}</p>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-slate-50/30 dark:bg-slate-900/30 scroll-smooth" onClick={() => setActiveMessageId(null)}>
          <div className="mt-auto" />
          <div className="space-y-6 py-4">
            {messages.map((m, index) => {
  const isMe = m.user === userProfile.name;
  const isMenuOpen = activeMessageId === m.id;
  
  return (
    <div 
      key={m.id || index} 
      className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} relative group w-full max-w-full px-2 mb-4`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-grc-red shrink-0 mb-5">
        <User size={16} />
      </div>

      {/* Message Content & PC Reply Action Wrapper */}
      <div className={`flex items-center gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* The Actual Bubble Container */}
        <div 
          id={`msg-container-${m.id}`}
          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-transform duration-200 min-w-0`}
          onTouchStart={(e) => handleTouchStart(e, m)}
          onTouchMove={(e) => handleTouchMove(e, m)}
          onTouchEnd={(e) => handleTouchEnd(e, m)}
        >
          <div className="relative max-w-full">
            <div 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!isMe && !partnerLeft) setActiveMessageId(isMenuOpen ? null : m.id); 
              }}
              className={`px-4 py-2.5 rounded-2xl text-sm font-medium shadow-sm cursor-pointer break-words ${
                isMe ? 'bg-grc-red text-white rounded-tr-none' : 'bg-[var(--color-card-bg)] text-[var(--color-main-text)] border border-slate-100 dark:border-slate-800 rounded-tl-none'
              }`}
            >
              {/* Reply Preview inside Bubble */}
              {m.replyTo && (
                <div className={`mb-2 p-2 rounded-lg border-l-2 text-[10px] leading-tight ${
                  isMe ? 'bg-black/10 border-white/40 text-white/90' : 'bg-slate-100 dark:bg-slate-800 border-grc-red text-slate-500'
                }`}>
                  <span className="font-black uppercase block mb-0.5">{m.replyTo.user}</span>
                  <p className="truncate">{m.replyTo.text}</p>
                </div>
              )}
              {m.text}
            </div>

            {/* Reactions */}
            {m.reaction && (
              <div className={`absolute -bottom-3 ${isMe ? 'right-0' : 'left-0'} bg-white dark:bg-slate-700 rounded-full px-1.5 py-0.5 shadow-md border border-slate-100 dark:border-slate-600 text-xs z-10`}>
                {m.reaction}
              </div>
            )}
            
            {/* Reaction Selector */}
            {isMenuOpen && (
              <div className={`absolute top-[-45px] ${isMe ? 'right-0' : 'left-0'} flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2`}>
                {['❤️', '😂', '🔥', '👍'].map(emoji => (
                  <button key={emoji} type="button" onClick={() => addReaction(m.id, emoji)} className="text-xl hover:scale-125 transition-transform">{emoji}</button>
                ))}
              </div>
            )}
          </div>
          
          {/* Timestamp & Seen Status */}
          <div className="mt-1 px-1 flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase">{formatTime(m.createdAt)}</span>
            {isMe && (
              <span className={`transition-colors ${m.seen ? 'text-blue-400' : 'text-slate-300'}`}>
                <CheckCheck size={12} strokeWidth={3} />
              </span>
            )}
          </div>
        </div>

        {/* REFINED PC REPLY BUTTON (Outside the flow, visible on hover) */}
        {!partnerLeft && (
          <button 
            type="button"
            onClick={() => setReplyTo(m)}
            className="hidden md:flex opacity-0 group-hover:opacity-100 transition-all p-2 text-slate-400 hover:text-grc-red hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full shrink-0"
            title="Reply"
          >
            <Reply size={18} className={isMe ? "scale-x-[-1]" : ""} />
          </button>
        )}
      </div>
    </div>
  );
})}

{/* Status UI */}
{partner.typing && !partnerLeft && (
  <div className="flex items-end gap-3 animate-pulse pb-2">
    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center shrink-0 relative mb-5">
      <User size={20} className="text-slate-300" />
    </div>
    <div className="flex flex-col items-start max-w-[75%]">
      <p className="text-[9px] font-bold text-grc-red uppercase px-1 mb-1 tracking-tighter">{partner.name} is typing...</p>
      <div className="bg-white dark:bg-slate-800 px-4 py-2.5 rounded-2xl rounded-bl-none border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
          <span className="w-1.5 h-1.5 bg-grc-red rounded-full animate-bounce [animation-duration:0.8s]"></span>
          <span className="w-1.5 h-1.5 bg-grc-red rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]"></span>
          <span className="w-1.5 h-1.5 bg-grc-red rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]"></span>
        </div>
      </div>
    </div>
  </div>
)}

{partnerLeft && (
  <div className="flex flex-col items-center my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="bg-white dark:bg-slate-800 px-6 py-3 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-3">
      <div className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{partner.name} left the room.</p>
    </div>
    <button onClick={onExit} className="mt-6 flex items-center gap-2 px-6 py-2 bg-grc-red/10 text-grc-red rounded-xl text-xs font-black uppercase tracking-widest hover:bg-grc-red hover:text-white transition-all active:scale-95">
      <LogOut size={14} /> Return to Lobby
    </button>
  </div>
)}
<div ref={scrollRef} />
</div>
</div>

{/* Form Area */}
<div className="shrink-0 bg-[var(--color-card-bg)] border-t border-slate-100 dark:border-slate-800 pb-safe transition-opacity">
  
  {/* REPLY PREVIEW UI (Refined for scannability) */}
  {replyTo && (
    <div className="mx-4 mt-3 flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border-l-4 border-grc-red animate-in slide-in-from-bottom-2 duration-200">
      <div className="min-w-0">
        <p className="text-[10px] font-black text-grc-red uppercase leading-none mb-1">Replying to {replyTo.user}</p>
        <p className="text-xs text-slate-500 truncate">{replyTo.text}</p>
      </div>
      <button type="button" onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-grc-red transition-colors">
        <X size={16} />
      </button>
    </div>
  )}

  <form onSubmit={sendMessage} className={`p-4 flex gap-3 ${partnerLeft ? 'opacity-50 pointer-events-none' : ''}`}>
    <input 
      value={inputText}
      onChange={(e) => handleTyping(e.target.value)}
      disabled={partnerLeft}
      autoFocus={!!replyTo} // Automatically focus when replying
      placeholder={partnerLeft ? "Chat ended" : "Type your message..."}
      className="flex-1 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl outline-none border-2 border-transparent focus:border-grc-red focus:bg-[var(--color-card-bg)] transition-all text-sm font-medium text-[var(--color-main-text)]"
    />
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setShowExitModal(true)} className="group flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-grc-red hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 border border-slate-100 dark:border-slate-800">
        <LogOut size={18} />
      </button>
      <button type="submit" disabled={partnerLeft || !inputText.trim()} className="bg-grc-red text-white p-4 rounded-2xl hover:brightness-90 active:scale-95 transition-all shadow-lg flex items-center justify-center">
        <Send size={20} />
      </button>
    </div>
  </form>
</div>
      </div>
    </div>
  );
}