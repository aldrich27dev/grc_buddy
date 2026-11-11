import { useRef, useState } from 'react';
import { Heart, ChevronRight, UserCircle2, Sparkles, Mars, Venus, MapPin, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../firebase/auth';
import { findOrCreateMatch } from '../services/rooms';
import {
  COURSES,
  YEARS,
  LOCATIONS,
  getAvailableInterests,
  MIN_INTERESTS,
  MAX_INTERESTS,
  MAX_NAME_LENGTH,
} from '../constants/catalog';

export default function Lobby({ onMatchStart, userProfile, onLogout, isDark, setIsDark }) {
  const [formData, setFormData] = useState({
    name: userProfile?.name || '',
    year: userProfile?.year || '',
    course: userProfile?.course || '',
    interests: (userProfile?.interests || []).slice(0, MAX_INTERESTS),
    gender: userProfile?.gender || '',
    location: userProfile?.location || '',
  });
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const availableInterests = getAvailableInterests(formData.course);

  const toggleInterest = (value) => {
    setFormData((prev) => {
      const current = prev.interests;
      if (current.includes(value)) {
        return { ...prev, interests: current.filter((interest) => interest !== value) };
      }
      if (current.length < MAX_INTERESTS) {
        return { ...prev, interests: [...current, value] };
      }
      return prev;
    });
  };

  const startMatching = async () => {
    if (submittingRef.current) return;

    const name = formData.name.trim();

    if (!name || !formData.year || !formData.course || !formData.gender || !formData.location) {
      return toast.error("Please fill in all fields!");
    }
    if (name.length < 2) {
      return toast.error("Your nickname must be at least 2 characters.");
    }
    if (formData.interests.length < MIN_INTERESTS) {
      return toast.error("Select at least 3 topics!");
    }
    if (!auth.currentUser) {
      return toast.error("Still connecting. Please try again in a moment.");
    }

    setLoading(true);
    submittingRef.current = true;

    try {
      const profile = { ...formData, name };
      const { roomId, role } = await findOrCreateMatch(profile, auth.currentUser.uid);

      onMatchStart(profile, roomId, role);

      if (role === 'user2') {
        toast.success("Buddy Found!");
      } else {
        toast("Waiting for a buddy...", { icon: '⏳' });
      }
    } catch (error) {
      console.error(error);
      if (error?.code === 'permission-denied') {
        toast.error('Firestore blocked the request. Deploy the security rules, then try again.');
      } else if (error?.code === 'resource-exhausted') {
        toast.error("Today's free Firestore limit was reached. Please try again later.");
      } else {
        toast.error("Couldn't start matching. Check your connection and try again.");
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-72px)] bg-[var(--color-app-bg)] px-6 py-10">

      <button
        onClick={() => setIsDark((value) => !value)}
        className="absolute top-6 right-6 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-yellow-400 transition-all hover:scale-110 active:scale-95"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        type="button"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-md flex flex-col items-center">
        <div className="bg-grc-red p-6 rounded-[2rem] shadow-2xl mb-8">
          <Heart size={40} color="white" fill="white" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-[var(--color-main-text)] tracking-tighter italic">
            GRC<span className="text-grc-red">Buddy</span>
          </h1>
          <p className="text-slate-500 text-[10px] mt-2 font-black uppercase tracking-[0.2em]">
            {userProfile ? `Welcome back, ${userProfile.name} • ${userProfile.year}` : 'Find your GRCBuddy now!'}
          </p>
        </div>

        <div className="w-full space-y-4">
          {!userProfile && (
            <>
              <input
                placeholder="Nickname"
                value={formData.name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                aria-label="Nickname"
                className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold shadow-sm text-[var(--color-main-text)]"
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                {['Male', 'Female'].map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setFormData({ ...formData, gender })}
                    aria-pressed={formData.gender === gender}
                    className={`p-5 rounded-2xl border-2 font-bold transition-all flex items-center justify-center gap-2 ${
                      formData.gender === gender
                        ? 'border-grc-red bg-grc-red text-white shadow-lg'
                        : 'border-slate-100 dark:border-slate-800 text-slate-400 bg-white dark:bg-slate-800/50 hover:border-slate-200'
                    }`}
                  >
                    {gender === 'Male' ? <Mars size={20} /> : <Venus size={20} />}
                    <span className="text-[10px] uppercase tracking-widest">{gender}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <select
                  aria-label="Year level"
                  className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold appearance-none cursor-pointer text-[var(--color-main-text)]"
                  value={formData.year}
                  onChange={(event) => setFormData({ ...formData, year: event.target.value })}
                >
                  <option value="">Year</option>
                  {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>

                <select
                  aria-label="Course"
                  className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold appearance-none cursor-pointer text-[var(--color-main-text)]"
                  value={formData.course}
                  onChange={(event) => setFormData({ ...formData, course: event.target.value, interests: [] })}
                >
                  <option value="">Course</option>
                  {COURSES.map((course) => <option key={course} value={course}>{course}</option>)}
                </select>
              </div>

              <div className="relative">
                <select
                  aria-label="Current city"
                  className="w-full p-5 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-grc-red outline-none transition-all font-semibold appearance-none cursor-pointer text-[var(--color-main-text)] pr-12"
                  value={formData.location}
                  onChange={(event) => setFormData({ ...formData, location: event.target.value })}
                >
                  <option value="">Current Location (City)</option>
                  {LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
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
              <span className={`text-[10px] font-black ${formData.interests.length >= MIN_INTERESTS ? 'text-green-500' : 'text-slate-400'}`}>
                {formData.interests.length}/{MAX_INTERESTS}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-1 scrollbar-hide">
              {formData.course ? (
                availableInterests.map((interest) => {
                  const isSelected = formData.interests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      aria-pressed={isSelected}
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
            className="w-full bg-grc-red text-white font-black py-6 rounded-2xl hover:brightness-95 active:scale-[0.97] transition-all mt-6 flex justify-center items-center gap-3 uppercase tracking-widest text-sm shadow-xl shadow-red-200 dark:shadow-none disabled:opacity-70"
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