import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Heart, ChevronRight, UserCircle2, Sparkles, Mars, Venus, MapPin } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const interestsMap = {
  'BSIT': ['Programming', 'Cybersecurity', 'Web Dev', 'Gaming', 'AI & Tech'],
  'BSBA': ['Marketing', 'Management', 'Stocks', 'Business Trends'],
  'BS Entrepreneurship': ['Startups', 'Innovation', 'E-commerce', 'Pitching Ideas'],
  'BS Accountancy': ['Taxation', 'Auditing', 'Bookkeeping', 'Financial Analysis'],
  'BS Education': ['Teaching Tips', 'Lesson Planning', 'Literature', 'Psychology'],
  'General': ['Music', 'Movies', 'Love Advice', 'Study Buddy', 'Random Chat']
};

// Location List for GRC Community
const locations = [
  'Caloocan City',
  'Malabon City',
  'Navotas City',
  'Valenzuela City',
  'Quezon City',
  'Manila',
  'Bulacan',
  'Prefer not to say'
];

export default function Lobby({ onMatchStart, userProfile, onLogout }) {
  const [formData, setFormData] = useState({ 
    name: userProfile?.name || '', 
    year: userProfile?.year || '', 
    course: userProfile?.course || '', 
    interests: userProfile?.interests || [],
    gender: userProfile?.gender || '',
    location: userProfile?.location || '' // Added location state
  });
  const [loading, setLoading] = useState(false);

  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const courses = Object.keys(interestsMap).filter(k => k !== 'General');
  
  const availableInterests = [
    ...(interestsMap[formData.course] || []), 
    ...interestsMap.General
  ];

  const toggleInterest = (val) => {
    setFormData(prev => {
      const current = prev.interests;
      if (current.includes(val)) {
        return { ...prev, interests: current.filter(i => i !== val) };
      }
      if (current.length < 5) {
        return { ...prev, interests: [...current, val] };
      }
      return prev;
    });
  };

  const startMatching = async () => {
    // Logic check updated to include location
    if (!formData.name || !formData.year || !formData.course || !formData.gender || !formData.location) {
      return toast.error("Please fill in all fields!");
    }
    if (formData.interests.length < 3) {
      return toast.error("Select at least 3 topics!");
    }
    
    setLoading(true);

    try {
      const q = query(
        collection(db, "rooms"), 
        where("status", "==", "waiting"), 
        where("interests", "array-contains-any", formData.interests),
        limit(1)
      );
      
      const snap = await getDocs(q);

     if (!snap.empty) {
        const room = snap.docs[0];
        const roomData = room.data();
        toast.success("Buddy Found!");
        
       const partnerData = {
          name: roomData.user1,
          course: roomData.user1Course,
          year: roomData.user1Year,
          gender: roomData.user1Gender,
          location: roomData.user1Location,
          interests: roomData.interests
        };

       onMatchStart({ ...formData }, room.id, 'user2', partnerData);
      } else {
        toast("Waiting for a buddy...", { icon: '⏳' });
        
        const newDoc = {
          user1: formData.name,
          user1Course: formData.course,
          user1Year: formData.year,
          user1Gender: formData.gender,
          user1Location: formData.location,
          interests: formData.interests,
          status: "waiting",
          user2: null, 
          typing1: false,
          typing2: false,
          createdAt: serverTimestamp(),
          endedBy: null
        };

        const roomRef = await addDoc(collection(db, "rooms"), newDoc);
        onMatchStart(formData, roomRef.id, 'user1');
      }
    } catch (e) { 
      console.error(e);
      toast.error("Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-72px)] bg-[var(--color-app-bg)] px-6 py-10">
      <Toaster position="top-center" />

      <div className="w-full max-w-md flex flex-col items-center">
        <div className="bg-grc-red p-6 rounded-[2rem] shadow-2xl mb-8">
          <Heart size={40} color="white" fill="white" />
        </div>
        
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-[var(--color-main-text)] tracking-tighter italic">
            GRC<span className="text-grc-red">Buddy</span>
          </h1>
          <p className="text-slate-500 text-[10px] mt-2 font-black uppercase tracking-[0.2em]">
            {userProfile ? `Welcome back, ${userProfile.name} !` : 'Find your GRCBuddy now!'}
          </p>
        </div>
        
        <div className="w-full space-y-4">
          {!userProfile && (
            <>
              <input 
                placeholder="Nickname" 
                value={formData.name}
                className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold shadow-sm text-[var(--color-main-text)]"
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />

              <div className="grid grid-cols-2 gap-4">
                {['Male', 'Female'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFormData({...formData, gender: g})}
                    className={`p-5 rounded-2xl border-2 font-bold transition-all flex items-center justify-center gap-2 ${
                      formData.gender === g 
                      ? 'border-grc-red bg-grc-red text-white shadow-lg' 
                      : 'border-slate-100 dark:border-slate-800 text-slate-400 bg-white dark:bg-slate-800/50 hover:border-slate-200'
                    }`}
                  >
                    {g === 'Male' ? <Mars size={20} /> : <Venus size={20} />}
                    <span className="text-[10px] uppercase tracking-widest">{g}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <select 
                    className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold appearance-none cursor-pointer text-[var(--color-main-text)]"
                    value={formData.year}
                    onChange={(e) => setFormData({...formData, year: e.target.value})}
                  >
                    <option value="">Year</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>

                  <select 
                    className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold appearance-none cursor-pointer text-[var(--color-main-text)]"
                    value={formData.course}
                    onChange={(e) => setFormData({...formData, course: e.target.value, interests: []})}
                  >
                    <option value="">Course</option>
                    {courses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>

              {/* NEW LOCATION DROPDOWN */}
              <div className="relative">
                <select 
                  className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold appearance-none cursor-pointer text-[var(--color-main-text)] pr-12"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                >
                  <option value="">Current Location (City)</option>
                  {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <MapPin size={20} />
                </div>
              </div>
            </>
          )}

          <div className="pt-2">
            <div className="flex justify-between items-center mb-3 px-2">
              <p className="text-[10px] font-black text-grc-red uppercase tracking-widest flex items-center gap-1">
                 <Sparkles size={12} /> Topics (Select 3-5)
              </p>
              <span className={`text-[10px] font-black ${formData.interests.length >= 3 ? 'text-green-500' : 'text-slate-400'}`}>
                {formData.interests.length}/5
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-1 scrollbar-hide">
              {formData.course ? (
                availableInterests.map(interest => {
                  const isSelected = formData.interests.includes(interest);
                  return (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all border-2 ${
                        isSelected 
                        ? 'bg-grc-red border-grc-red text-white scale-105 shadow-md' 
                        : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      {interest}
                    </button>
                  );
                })
              ) : (
                <div className="w-full p-4 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Select a course first</p>
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={startMatching}
            disabled={loading}
            className="w-full bg-grc-red text-white font-black py-6 rounded-2xl hover:brightness-95 active:scale-[0.97] transition-all mt-6 flex justify-center items-center gap-3 uppercase tracking-widest text-sm shadow-xl shadow-red-200 dark:shadow-none"
          >
            {loading ? (
              <div className="h-6 w-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>{userProfile ? 'Search Next Buddy' : 'Find a Buddy'} <ChevronRight size={20} /></>
            )}
          </button>

          {userProfile && (
            <button 
              onClick={onLogout}
              className="w-full mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-grc-red transition-colors flex items-center justify-center gap-2"
            >
              <UserCircle2 size={14} /> Not {userProfile.name}? Change Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}