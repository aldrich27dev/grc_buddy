import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../firebase/config';
import {
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { Send, User, LogOut, Mars, Venus, AlertCircle, MapPin, CheckCheck, Reply, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../firebase/auth';
import {
  getRole,
  getSharedInterests,
  heartbeatRoom,
  leaveRoom,
  markMessagesSeen,
  sendChatMessage,
  setMessageReaction,
} from '../services/rooms';
import { MAX_MESSAGE_LENGTH } from '../constants/catalog';
import ShoutoutBanner from './ShoutoutBanner';
import { SHOUTOUTS_ENABLED } from '../constants/shoutouts';

const MESSAGE_PAGE_SIZE = 30;

export default function Chat({ roomId, userProfile, userRole, onExit, onOpenShoutout }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [room, setRoom] = useState(null);
  const [partner, setPartner] = useState({ name: 'Waiting...', course: '', year: '', gender: '', location: '', typing: false });
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState({ id: null, x: 0 });
  const [messageLimit, setMessageLimit] = useState(MESSAGE_PAGE_SIZE);
  const [sending, setSending] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const scrollRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingActiveRef = useRef(false);
  const lastSentRef = useRef(0);
  const lastMessageIdRef = useRef(null);
  const roleRef = useRef(userRole);
  const seenInFlightRef = useRef(new Set());

  const uid = auth.currentUser?.uid;
  const sharedInterests = getSharedInterests(room);
  const topicLabel = sharedInterests[0] || room?.interests?.[0] || 'General';

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isMyMessage = useCallback((message) => {
    if (message.senderId) return message.senderId === uid;
    return message.senderName === userProfile?.name || message.user === userProfile?.name;
  }, [uid, userProfile?.name]);

  const updateTyping = (value) => {
    const role = roleRef.current;
    if (!role) return;
    updateDoc(doc(db, 'rooms', roomId), {
      [role === 'user1' ? 'typing1' : 'typing2']: value,
    }).catch(() => {
      // Typing indicators are best-effort.
    });
  };

  const stopTyping = () => {
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    updateTyping(false);
  };

  // Mobile swipe-to-reply handlers
  const handleTouchStart = (event, message) => {
    if (partnerLeft) return;
    setSwipeOffset({ id: message.id, x: event.touches[0].clientX });
  };

  const handleTouchMove = (event, message) => {
    if (swipeOffset.id !== message.id) return;
    const deltaX = event.touches[0].clientX - swipeOffset.x;
    if (deltaX > 0 && deltaX < 60) {
      const element = document.getElementById(`msg-container-${message.id}`);
      if (element) element.style.transform = `translateX(${deltaX}px)`;
    }
  };

  const handleTouchEnd = (event, message) => {
    const deltaX = event.changedTouches[0].clientX - swipeOffset.x;
    const element = document.getElementById(`msg-container-${message.id}`);
    if (element) element.style.transform = 'translateX(0px)';
    if (deltaX > 45) setReplyTo(message);
    setSwipeOffset({ id: null, x: 0 });
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (!snapshot.exists()) {
        setPartnerLeft(true);
        return;
      }

      setConnectionError(false);
      const data = snapshot.data();
      setRoom(data);

      const role = getRole(data, uid);
      if (!role) {
        // The student who claims a room can briefly receive the cached
        // pre-claim snapshot where the room is still waiting. Wait for the
        // transaction update instead of ending the chat immediately.
        if (data.status === 'waiting') return;
        setPartnerLeft(true);
        return;
      }

      roleRef.current = role;

      if (data.status === 'ended') {
        setPartnerLeft(true);
        return;
      }

      // A later snapshot can recover from a transient missing/ended state.
      setPartnerLeft(false);

      const partnerData = role === 'user1' ? data.user2 : data.user1;
      if (partnerData) {
        setPartner({
          name: partnerData.name || 'GRC Student',
          course: partnerData.course || 'GRC Student',
          year: partnerData.year || '',
          gender: partnerData.gender || '',
          location: partnerData.location || '',
          typing: role === 'user1' ? !!data.typing2 : !!data.typing1,
        });
      }
    }, (error) => {
      console.error('Chat room connection lost:', error);
      setConnectionError(true);
    });

    return unsubscribe;
  }, [roomId, uid]);

  useEffect(() => {
    const messagesQuery = query(
      collection(db, 'rooms', roomId, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(messageLimit)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() })));
      setConnectionError(false);
    }, (error) => {
      console.error('Messages connection lost:', error);
      setConnectionError(true);
    });

    return unsubscribe;
  }, [roomId, messageLimit]);

  useEffect(() => {
    // Only follow new messages. Loading earlier history must keep the
    // student's current scroll position instead of jumping to the bottom.
    const newestId = messages[messages.length - 1]?.id || null;
    if (!newestId || newestId === lastMessageIdRef.current) return;

    lastMessageIdRef.current = newestId;
    const timer = setTimeout(scrollToBottom, 80);
    return () => clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 80);
    return () => clearTimeout(timer);
  }, [partner.typing, partnerLeft]);

  useEffect(() => {
    if (partnerLeft || !uid || messages.length === 0) return;

    const unseenIds = messages
      .filter((message) => !isMyMessage(message) && message.seen !== true)
      .map((message) => message.id)
      .filter((messageId) => !seenInFlightRef.current.has(messageId));

    if (unseenIds.length === 0) return;

    unseenIds.forEach((messageId) => seenInFlightRef.current.add(messageId));
    markMessagesSeen(roomId, unseenIds)
      .catch((error) => {
        console.error('Could not mark messages as seen:', error);
        unseenIds.forEach((messageId) => seenInFlightRef.current.delete(messageId));
      });
  }, [messages, roomId, uid, partnerLeft, isMyMessage]);

  useEffect(() => {
    if (partnerLeft) return;

    const beat = () => {
      const role = roleRef.current;
      if (!role) return;
      heartbeatRoom(roomId, role).catch(() => {
        // Firestore retries automatically; the snapshot will report a real failure.
      });
    };

    beat();
    const interval = setInterval(beat, 60000);

    return () => clearInterval(interval);
  }, [roomId, partnerLeft]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typingActiveRef.current && roleRef.current) {
      const field = roleRef.current === 'user1' ? 'typing1' : 'typing2';
      updateDoc(doc(db, 'rooms', roomId), { [field]: false }).catch(() => {});
    }
  }, [roomId]);

  const handleTyping = (value) => {
    setInputText(value);

    if (partnerLeft) return;

    if (!value.trim()) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      stopTyping();
      return;
    }

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      updateTyping(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 1800);
  };

  const handleSend = async (event) => {
    event.preventDefault();

    const text = inputText.trim();
    if (!text || partnerLeft || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    // A small client-side throttle prevents accidental double sends.
    if (Date.now() - lastSentRef.current < 700) return;
    if (!uid) {
      toast.error('Still connecting. Please try again in a moment.');
      return;
    }

    lastSentRef.current = Date.now();
    const currentReply = replyTo;
    setInputText('');
    setReplyTo(null);
    setSending(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      updateTyping(false);
    }

    try {
      await sendChatMessage({
        roomId,
        uid,
        profile: userProfile,
        text,
        replyTo: currentReply,
      });
    } catch (error) {
      console.error('Could not send message:', error);
      setInputText(text);
      toast.error("Message couldn't be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const addReaction = async (messageId, emoji) => {
    if (partnerLeft) return;
    try {
      await setMessageReaction(roomId, messageId, emoji);
    } catch (error) {
      console.error('Could not add reaction:', error);
      toast.error("Couldn't add that reaction.");
    }
    setActiveMessageId(null);
  };

  const handleExitChat = () => {
    // Leave immediately; the room close can finish in the background.
    if (uid) {
      leaveRoom(roomId, uid).catch((error) => {
        console.error('Could not close the room cleanly:', error);
      });
    }
    onExit();
  };

  const canLoadEarlier = messages.length >= messageLimit;

  return (
    <div className="flex flex-col h-[calc(100dvh-72px)] bg-[var(--color-app-bg)] transition-colors duration-300 overflow-hidden relative">

      {/* EXIT MODAL */}
      {showExitModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-chat-title"
            className="bg-[var(--color-card-bg)] w-full max-w-xs rounded-[2rem] p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-pop-in"
          >
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-grc-red mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 id="exit-chat-title" className="text-lg font-black text-[var(--color-main-text)] uppercase tracking-tight">End this chat?</h3>
            <p className="text-xs text-slate-500 font-bold mt-2">You will be disconnected from your buddy.</p>
            <div className="flex flex-col gap-2 mt-6">
              <button onClick={handleExitChat} type="button" className="w-full py-3 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Yes, Leave</button>
              <button onClick={() => setShowExitModal(false)} type="button" className="w-full py-3 text-slate-500 dark:text-slate-400 font-bold uppercase text-xs tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">Cancel</button>
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
                {partner?.year && (
                  <span className="inline-block shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {partner.year}
                  </span>
                )}
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
            <p className="text-xs font-bold text-[var(--color-main-text)] opacity-80 truncate max-w-[70px] md:max-w-none">{topicLabel}</p>
          </div>
        </div>

        {connectionError && (
          <div role="status" className="shrink-0 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-widest text-center py-2 px-4 border-b border-amber-100 dark:border-amber-900/30">
            Connection lost — trying to reconnect...
          </div>
        )}

        {SHOUTOUTS_ENABLED && (
          <div className="pt-2">
            <ShoutoutBanner variant="chat" onBook={onOpenShoutout} />
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-slate-50/30 dark:bg-slate-900/30 scroll-smooth" onClick={() => setActiveMessageId(null)}>
          <div className="mt-auto" />
          <div className="space-y-6 py-4">
            {canLoadEarlier && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => setMessageLimit((limit) => limit + MESSAGE_PAGE_SIZE)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-grc-red transition-colors px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Load earlier messages
                </button>
              </div>
            )}

            {messages.map((message, index) => {
              const isMe = isMyMessage(message);
              const isMenuOpen = activeMessageId === message.id;

              return (
                <div
                  key={message.id || index}
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
                      id={`msg-container-${message.id}`}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-transform duration-200 min-w-0`}
                      onTouchStart={(event) => handleTouchStart(event, message)}
                      onTouchMove={(event) => handleTouchMove(event, message)}
                      onTouchEnd={(event) => handleTouchEnd(event, message)}
                    >
                      <div className="relative max-w-full">
                        <div
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isMe && !partnerLeft) setActiveMessageId(isMenuOpen ? null : message.id);
                          }}
                          className={`px-4 py-2.5 rounded-2xl text-sm font-medium shadow-sm cursor-pointer break-words ${
                            isMe ? 'bg-grc-red text-white rounded-tr-none' : 'bg-[var(--color-card-bg)] text-[var(--color-main-text)] border border-slate-100 dark:border-slate-800 rounded-tl-none'
                          }`}
                        >
                          {/* Reply Preview inside Bubble */}
                          {message.replyTo && (
                            <div className={`mb-2 p-2 rounded-lg border-l-2 text-[10px] leading-tight ${
                              isMe ? 'bg-black/10 border-white/40 text-white/90' : 'bg-slate-100 dark:bg-slate-800 border-grc-red text-slate-500'
                            }`}>
                              <span className="font-black uppercase block mb-0.5">{message.replyTo.senderName || message.replyTo.user || 'Buddy'}</span>
                              <p className="truncate">{message.replyTo.text}</p>
                            </div>
                          )}
                          {message.text}
                        </div>

                        {/* Reactions */}
                        {message.reaction && (
                          <div className={`absolute -bottom-3 ${isMe ? 'right-0' : 'left-0'} bg-white dark:bg-slate-700 rounded-full px-1.5 py-0.5 shadow-md border border-slate-100 dark:border-slate-600 text-xs z-10`}>
                            {message.reaction}
                          </div>
                        )}

                        {/* Reaction Selector */}
                        {isMenuOpen && (
                          <div className={`absolute top-[-45px] ${isMe ? 'right-0' : 'left-0'} flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl z-50 animate-slide-up`}>
                            {['❤️', '😂', '🔥', '👍'].map((emoji) => (
                              <button key={emoji} type="button" aria-label={`React with ${emoji}`} onClick={() => addReaction(message.id, emoji)} className="text-xl hover:scale-125 transition-transform">{emoji}</button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Timestamp & Seen Status */}
                      <div className="mt-1 px-1 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{formatTime(message.createdAt)}</span>
                        {isMe && (
                          <span className={`transition-colors ${message.seen ? 'text-blue-400' : 'text-slate-300'}`}>
                            <CheckCheck size={12} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* PC reply button */}
                    {!partnerLeft && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(message)}
                        aria-label="Reply to message"
                        className="hidden md:flex opacity-0 group-hover:opacity-100 transition-all p-2 text-slate-400 hover:text-grc-red hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full shrink-0"
                        title="Reply"
                      >
                        <Reply size={18} className={isMe ? 'scale-x-[-1]' : ''} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Status UI */}
            {partner.typing && !partnerLeft && (
              <div className="flex items-end gap-3 animate-pulse pb-2" role="status" aria-live="polite">
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
              <div className="flex flex-col items-center my-10 animate-slide-up" role="status">
                <div className="bg-white dark:bg-slate-800 px-6 py-3 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-3">
                  <div className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{partner.name} left the room.</p>
                </div>
                <button onClick={onExit} type="button" className="mt-6 flex items-center gap-2 px-6 py-2 bg-grc-red/10 text-grc-red rounded-xl text-xs font-black uppercase tracking-widest hover:bg-grc-red hover:text-white transition-all active:scale-95">
                  <LogOut size={14} /> Return to Lobby
                </button>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        {/* Form Area */}
        <div className="shrink-0 bg-[var(--color-card-bg)] border-t border-slate-100 dark:border-slate-800 pb-safe transition-opacity">

          {/* Reply Preview */}
          {replyTo && (
            <div className="mx-4 mt-3 flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border-l-4 border-grc-red animate-slide-up">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-grc-red uppercase leading-none mb-1">Replying to {replyTo.senderName || replyTo.user || 'Buddy'}</p>
                <p className="text-xs text-slate-500 truncate">{replyTo.text}</p>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1 text-slate-400 hover:text-grc-red transition-colors">
                <X size={16} />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className={`p-4 flex gap-3 ${partnerLeft ? 'opacity-50 pointer-events-none' : ''}`}>
            <input
              value={inputText}
              onChange={(event) => handleTyping(event.target.value)}
              disabled={partnerLeft}
              maxLength={MAX_MESSAGE_LENGTH}
              autoFocus={!!replyTo}
              enterKeyHint="send"
              aria-label="Message"
              placeholder={partnerLeft ? 'Chat ended' : 'Type your message...'}
              className="flex-1 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl outline-none border-2 border-transparent focus:border-grc-red focus:bg-[var(--color-card-bg)] transition-all text-sm font-medium text-[var(--color-main-text)]"
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowExitModal(true)}
                aria-label="End chat"
                className="group flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-grc-red hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 border border-slate-100 dark:border-slate-800"
              >
                <LogOut size={18} />
              </button>
              <button
                type="submit"
                disabled={partnerLeft || sending || !inputText.trim()}
                aria-label="Send message"
                className="bg-grc-red text-white p-4 rounded-2xl hover:brightness-90 active:scale-95 transition-all shadow-lg flex items-center justify-center disabled:opacity-50"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
