
import React, { useState, useEffect, useCallback, useRef } from 'react';
import VisualGarden from './components/VisualGarden';
import EmpathyGuide, { EmpathyGuideHandle } from './components/EmpathyGuide';
import { UserMood, EmotionType, MOOD_COLORS, Comment } from './types';
import { analyzeEmotionalLandscape } from './services/geminiService';

const INITIAL_MOODS: UserMood[] = [
  { id: '1', name: '子涵', emotion: EmotionType.CALM, intensity: 4, color: MOOD_COLORS[EmotionType.CALM], message: '静静看雨，心很平。', timestamp: Date.now() - 1000000, echoCount: 2, comments: [] },
  { id: '2', name: '阿明', emotion: EmotionType.JOY, intensity: 8, color: MOOD_COLORS[EmotionType.JOY], message: '项目终于上线了，好开心！', timestamp: Date.now() - 500000, echoCount: 5, comments: [] },
  { id: '3', name: '小雅', emotion: EmotionType.SORROW, intensity: 6, color: MOOD_COLORS[EmotionType.SORROW], message: '突然想起老家的猫了。', timestamp: Date.now() - 200000, echoCount: 1, comments: [] },
  { id: '4', name: '陈默', emotion: EmotionType.WONDER, intensity: 9, color: MOOD_COLORS[EmotionType.WONDER], message: '今晚的月色真的很美。', timestamp: Date.now() - 30000, echoCount: 3, comments: [] },
];

const BG_MUSIC_URL = "https://cdn.pixabay.com/audio/2022/05/27/audio_1808f3030c.mp3"; 

const App: React.FC = () => {
  const [moods, setMoods] = useState<UserMood[]>(INITIAL_MOODS);
  const [collectiveMessage, setCollectiveMessage] = useState<string>("空间很安静，等待着第一声心语的回响。");
  const [activeTab, setActiveTab] = useState<'garden' | 'feed'>('garden');
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [currentUserName, setCurrentUserName] = useState<string>(() => localStorage.getItem('user_nickname') || '');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const empathyGuideRef = useRef<EmpathyGuideHandle | null>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);

  const sanitizeMessage = (text: string) => {
    return text
      .replace(/\*\*|\*|_/g, '') 
      .replace(/[\(\（].*?[\)\）]/g, '') 
      .replace(/["'“ ”‘ ’]/g, '') 
      .trim();
  };

  const updateCollectiveSoul = useCallback(async (currentMoods: UserMood[]) => {
    const moodStrings = currentMoods.map(m => m.emotion);
    const rawMessage = await analyzeEmotionalLandscape(moodStrings);
    setCollectiveMessage(sanitizeMessage(rawMessage));
  }, []);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isMusicPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.log("Autoplay blocked or failed", e));
    }
    setIsMusicPlaying(!isMusicPlaying);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const handleToggleStats = () => {
    empathyGuideRef.current?.toggleHistory();
  };

  useEffect(() => {
    updateCollectiveSoul(INITIAL_MOODS);
    
    const audio = new Audio(BG_MUSIC_URL);
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    const attemptAutoplay = () => {
      audio.play().then(() => {
        setIsMusicPlaying(true);
      }).catch((err) => {
        console.warn("Autoplay still blocked:", err);
      });
      window.removeEventListener('click', attemptAutoplay);
    };

    window.addEventListener('click', attemptAutoplay);

    const interval = setInterval(() => {
        const randomEmotions = Object.values(EmotionType);
        const randomEmotion = randomEmotions[Math.floor(Math.random() * randomEmotions.length)];
        const names = ['凯文', '米娜', '奥利', '苏菲', '悠木', '哲也'];
        const messages = ['在远方送出一个祝福', '此刻的风很温柔', '想念一个老朋友', '终于下班了', '生活总有光'];
        const name = names[Math.floor(Math.random() * names.length)];
        const msg = messages[Math.floor(Math.random() * messages.length)];
        
        const newMood: UserMood = {
            id: Math.random().toString(36).substr(2, 9),
            name: name,
            emotion: randomEmotion,
            intensity: Math.floor(Math.random() * 5) + 3,
            color: MOOD_COLORS[randomEmotion],
            message: msg,
            timestamp: Date.now(),
            echoCount: 0,
            comments: []
        };

        setMoods(prev => [...prev.slice(-19), newMood]);
    }, 45000);

    return () => {
      clearInterval(interval);
      audio.pause();
      window.removeEventListener('click', attemptAutoplay);
    };
  }, [updateCollectiveSoul]);

  const handleNewMood = (name: string, emotion: EmotionType, intensity: number, message: string) => {
    const newMood: UserMood = {
      id: Date.now().toString(),
      name,
      emotion,
      intensity,
      color: MOOD_COLORS[emotion],
      message,
      timestamp: Date.now(),
      echoCount: 0,
      comments: []
    };
    
    // Auto-identify user name globally
    setCurrentUserName(name);
    localStorage.setItem('user_nickname', name);

    setMoods(prev => {
        const updated = [...prev, newMood];
        updateCollectiveSoul(updated);
        return updated;
    });
    
    if (activeTab === 'feed') {
      setTimeout(() => {
        feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    }
  };

  const handleEcho = (moodId: string) => {
    setMoods(prev => prev.map(m => 
      m.id === moodId ? { ...m, echoCount: (m.echoCount || 0) + 1 } : m
    ));
  };

  const handleComment = (moodId: string, author: string, text: string) => {
    const newComment: Comment = {
      id: Date.now().toString(),
      author,
      text,
      timestamp: Date.now()
    };
    
    // Also sync the name if they just commented and didn't have one
    if (!currentUserName && author) {
      setCurrentUserName(author);
      localStorage.setItem('user_nickname', author);
    }

    setMoods(prev => prev.map(m => 
      m.id === moodId ? { ...m, comments: [...(m.comments || []), newComment] } : m
    ));
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-blue-500/30 overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900 rounded-full blur-[120px]" />
      </div>

      <header className="px-8 py-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg shadow-white/10 group-hover:scale-110 transition-transform duration-500">
            <span className="text-slate-950 text-2xl">✨</span>
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight text-white group-hover:tracking-wider transition-all duration-500">心语回响</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
             <div className="relative group/music">
               <button 
                  onClick={toggleMusic}
                  className={`flex items-center gap-3 px-5 py-2.5 rounded-full border transition-all duration-500 backdrop-blur-md shadow-lg ${
                    isMusicPlaying 
                    ? 'bg-white/10 text-white border-white/30 shadow-white/5' 
                    : 'bg-slate-900/60 text-slate-500 border-white/5 hover:text-slate-300 hover:border-white/10'
                  }`}
               >
                  <div className="flex items-end gap-[2px] h-3 w-4 mb-0.5">
                    {[0, 1, 2, 3].map(i => (
                      <div 
                        key={i} 
                        className={`w-1 bg-current rounded-full transition-all duration-500 ${isMusicPlaying ? 'animate-pulse' : 'h-[20%]'}`}
                        style={{ 
                          height: isMusicPlaying ? `${30 + Math.random() * 70}%` : '20%',
                          animationDelay: `${i * 0.2}s`,
                          animationDuration: '0.6s'
                        }} 
                      />
                    ))}
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] font-bold">
                    {isMusicPlaying ? '聆听中' : '已暂停'}
                  </span>
               </button>
               
               <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-5 bg-[#0a0f1e]/95 border border-white/10 rounded-[2rem] backdrop-blur-2xl opacity-0 translate-y-3 pointer-events-none group-hover/music:opacity-100 group-hover/music:translate-y-0 group-hover/music:pointer-events-auto transition-all duration-500 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[180px]">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">灵动音量</span>
                      <span className="text-[10px] text-white font-mono font-bold bg-white/5 px-2 py-0.5 rounded-md">{Math.round(volume * 100)}%</span>
                    </div>
                    
                    <div className="relative flex items-center h-8 px-2 group/slider">
                      <div className="absolute inset-x-4 inset-y-2 flex items-center justify-between pointer-events-none opacity-20">
                        {Array.from({ length: 12 }).map((_, i) => {
                          const h = 20 + Math.sin(i * 0.8) * 15 + 15;
                          const isActive = (i / 11) <= volume;
                          return (
                            <div 
                              key={i} 
                              className={`w-[2px] rounded-full transition-all duration-300 ${isActive ? 'bg-white opacity-100 scale-y-110' : 'bg-slate-700'}`}
                              style={{ height: `${h}%` }}
                            />
                          );
                        })}
                      </div>

                      <input 
                        type="range" min="0" max="1" step="0.01" 
                        value={volume} 
                        onChange={handleVolumeChange}
                        className="relative w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white hover:accent-indigo-400 transition-all z-10"
                        style={{
                          background: `linear-gradient(to right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.4) ${volume * 100}%, rgba(255,255,255,0.05) ${volume * 100}%, rgba(255,255,255,0.05) 100%)`
                        }}
                      />
                    </div>
                    <p className="text-[8px] text-slate-600 text-center italic tracking-tight">拖动滑块调节心语环境音</p>
                  </div>
               </div>
             </div>

            <div className="flex bg-slate-900/80 p-1 rounded-full border border-white/5 shadow-inner">
              <button 
                onClick={() => setActiveTab('garden')}
                className={`px-6 py-2 rounded-full transition-all text-xs font-bold ${activeTab === 'garden' ? 'bg-white text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                共鸣花园
              </button>
              <button 
                onClick={() => setActiveTab('feed')}
                className={`px-6 py-2 rounded-full transition-all text-xs font-bold ${activeTab === 'feed' ? 'bg-white text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                心语流
              </button>
            </div>

            <button 
              onClick={handleToggleStats}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all shadow-lg"
              title="情感轨迹统计"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>

          <div className="text-slate-400 flex items-center gap-2 text-xs bg-white/5 px-4 py-2.5 rounded-full border border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            {moods.length} 位灵魂正相连
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 px-8 pb-8 z-10 overflow-hidden">
        <div className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden">
            <h4 className="text-slate-500 text-xs uppercase tracking-[0.2em] mb-2 font-bold">集体心灵气象</h4>
            <p className="text-2xl font-serif text-white italic leading-relaxed">“{collectiveMessage}”</p>
          </div>

          <div className="flex-1 min-h-[400px] overflow-hidden">
            {activeTab === 'garden' ? (
              <VisualGarden 
                moods={moods} 
                onEcho={handleEcho} 
                onComment={(mood, author, text) => handleComment(mood.id, author, text)}
                currentUserName={currentUserName}
              />
            ) : (
              <div 
                ref={feedScrollRef}
                className="bg-slate-900/40 rounded-3xl border border-white/5 p-8 h-full overflow-y-auto custom-scrollbar shadow-inner relative"
              >
                <div className="absolute left-[2.4rem] top-8 bottom-8 w-[1px] bg-gradient-to-b from-blue-500/50 via-indigo-500/30 to-transparent z-0" />
                
                <div className="space-y-12 relative z-10">
                  {[...moods].reverse().map((mood, idx) => (
                    <div key={mood.id} className="flex gap-8 group/item animate-in fade-in slide-in-from-bottom-6 duration-700" style={{ animationDelay: `${idx * 0.05}s` }}>
                      
                      <div className="flex flex-col items-center shrink-0 w-12">
                        <div className="text-[10px] text-slate-500 font-mono font-bold mb-3 uppercase tracking-tighter opacity-60 group-hover/item:opacity-100 transition-opacity">
                          {formatTime(mood.timestamp)}
                        </div>
                        <div 
                          className="w-4 h-4 rounded-full ring-4 ring-slate-950 transition-all duration-500 group-hover/item:scale-150 z-10"
                          style={{ 
                            backgroundColor: mood.color,
                            boxShadow: `0 0 15px ${mood.color}88`
                          }} 
                        />
                      </div>

                      <div className="flex-1 pb-4">
                        <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 hover:border-white/10 hover:bg-white/[0.06] transition-all duration-500 shadow-lg relative group-hover/item:-translate-y-1">
                          
                          <div 
                            className="absolute top-4 right-4 text-[40px] opacity-[0.03] select-none pointer-events-none group-hover/item:opacity-[0.08] transition-opacity"
                            style={{ color: mood.color }}
                          >
                             {mood.emotion.charAt(0)}
                          </div>

                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ backgroundColor: mood.color + '44', border: `1px solid ${mood.color}44` }}>
                                {mood.name.charAt(0)}
                              </div>
                              <span className="font-bold text-white text-base tracking-tight">{mood.name}</span>
                              <span className="text-[10px] uppercase tracking-widest text-slate-500 px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                                {mood.emotion}
                              </span>
                            </div>
                            
                            {mood.echoCount ? (
                              <div className="flex items-center gap-1.5 text-pink-400/80">
                                <span className="text-[10px] font-bold">{mood.echoCount}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : null}
                          </div>

                          <p className="text-slate-200 italic text-xl font-serif leading-relaxed line-clamp-3 group-hover/item:line-clamp-none transition-all">
                            “{mood.message}”
                          </p>

                          {mood.comments && mood.comments.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                              {mood.comments.slice(0, 2).map(c => (
                                <div key={c.id} className="text-[11px] text-slate-400 italic">
                                  <span className="font-bold text-slate-300 mr-2">{c.author}:</span>
                                  {c.text}
                                </div>
                              ))}
                              {mood.comments.length > 2 && (
                                <div className="text-[9px] text-slate-500 uppercase">还有 {mood.comments.length - 2} 条评论...</div>
                              )}
                            </div>
                          )}

                          <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                             <button 
                               onClick={() => handleEcho(mood.id)}
                               className="text-[9px] uppercase tracking-widest font-bold text-slate-400 hover:text-pink-400 transition-colors"
                             >
                               传递共鸣
                             </button>
                             <div className="w-1 h-1 rounded-full bg-slate-800" />
                             <button className="text-[9px] uppercase tracking-widest font-bold text-slate-400 hover:text-blue-400 transition-colors">
                               分享此瞬
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {moods.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                       <div className="w-12 h-12 rounded-full border border-dashed border-slate-700 animate-spin-slow" />
                       <p className="font-serif italic text-sm tracking-wide">时间在此刻停滞，等待一段心声...</p>
                    </div>
                  )}

                  <div className="h-12 w-full bg-gradient-to-t from-slate-900 to-transparent sticky bottom-0 pointer-events-none" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
          <EmpathyGuide 
            onNewMood={handleNewMood} 
            collectiveMoods={moods} 
            ref={empathyGuideRef} 
            externalName={currentUserName}
          />
        </div>
      </main>

      <footer className="px-8 py-4 bg-slate-950/80 backdrop-blur-md border-t border-white/5 flex justify-between items-center text-[11px] text-slate-600 uppercase tracking-widest z-30">
        <div className="flex items-center gap-2">
          <span>&copy; 2024 心语回响</span>
          <span className="text-slate-800">|</span>
          <span className="italic">每一朵云都有它的归宿</span>
        </div>
        <div className="flex gap-6">
          <span className="hover:text-slate-400 cursor-pointer transition-colors">灵魂隐私</span>
          <span className="hover:text-slate-400 cursor-pointer transition-colors">社区和谐</span>
          <span className="hover:text-slate-400 cursor-pointer transition-colors">关于这里</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
