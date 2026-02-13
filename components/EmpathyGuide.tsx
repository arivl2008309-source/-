
import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import * as d3 from 'd3';
import { getEmpathyResponse, getDeepChatResponse } from '../services/geminiService';
import { EmotionType, MOOD_COLORS, UserMood } from '../types';

const EMOTION_LABELS: Record<string, string> = {
  [EmotionType.JOY]: '喜悦',
  [EmotionType.CALM]: '平和',
  [EmotionType.SORROW]: '忧伤',
  [EmotionType.ANXIETY]: '焦虑',
  [EmotionType.LOVE]: '爱意',
  [EmotionType.WONDER]: '惊叹'
};

interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
}

interface PersonalMoodEntry {
  emotion: EmotionType;
  message: string;
  timestamp: number;
}

interface EmpathyGuideProps {
  onNewMood: (name: string, emotion: EmotionType, intensity: number, message: string) => void;
  collectiveMoods: UserMood[];
  externalName?: string;
}

export interface EmpathyGuideHandle {
  startChatWithContext: (text: string) => void;
  toggleHistory: () => void;
}

// 趋势图子组件
const TrendChart: React.FC<{ data: PersonalMoodEntry[] }> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = 120;
    const margin = { top: 10, right: 10, bottom: 20, left: 25 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // 准备数据：按天统计数量（过去7天）
    const now = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const chartData = last7Days.map(date => {
      const count = data.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === date.getTime();
      }).length;
      return { date, count };
    });

    const x = d3.scaleBand()
      .domain(chartData.map(d => d.date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })))
      .range([margin.left, width - margin.right])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, d3.max(chartData, d => d.count) || 5])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // 绘制坐标轴
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8))
      .call(g => g.select(".domain").attr("stroke", "rgba(255,255,255,0.05)"))
      .call(g => g.selectAll("text").attr("fill", "rgba(255,255,255,0.3)").attr("font-size", "8px"));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(5))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll("text").attr("fill", "rgba(255,255,255,0.3)").attr("font-size", "8px"));

    // 绘制柱状图
    svg.selectAll(".bar")
      .data(chartData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }))!)
      .attr("y", height - margin.bottom)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", "url(#barGradient)")
      .attr("rx", 2)
      .transition()
      .duration(800)
      .attr("y", d => y(d.count))
      .attr("height", d => height - margin.bottom - y(d.count));

    // 渐变定义
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", "barGradient")
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#6366f1");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#4f46e5");

  }, [data]);

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 mb-6">
      <div className="flex justify-between items-center mb-2 px-1">
        <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">近 7 日心灵动态</span>
        <span className="text-[8px] text-indigo-400 font-bold">趋势分析</span>
      </div>
      <svg ref={svgRef} className="w-full h-[120px]" />
    </div>
  );
};

const EmpathyGuide = forwardRef<EmpathyGuideHandle, EmpathyGuideProps>(({ onNewMood, collectiveMoods, externalName }, ref) => {
  const [mode, setMode] = useState<'guide' | 'chat'>('guide');
  const [statsView, setStatsView] = useState<'collective' | 'personal'>('collective');
  const [historySubTab, setHistorySubTab] = useState<'dist' | 'trend'>('dist');
  const [step, setStep] = useState(1);
  const [name, setName] = useState(externalName || '');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [message, setMessage] = useState('');
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Sync internal name state when external identification changes
  useEffect(() => {
    if (externalName && externalName !== name) {
      setName(externalName);
    }
  }, [externalName]);

  // 个人心情寄语历史 - 仅本地存储
  const [personalMoodHistory, setPersonalMoodHistory] = useState<PersonalMoodEntry[]>(() => {
    const saved = localStorage.getItem('personal_mood_history_v2');
    return saved ? JSON.parse(saved) : [];
  });

  // 对话历史
  const [chatHistory, setChatHistory] = useState<Message[]>(() => {
    const saved = localStorage.getItem('soul_chat_history');
    return saved ? JSON.parse(saved) : [
      { 
        role: 'model', 
        text: '你好，我是你的心灵伙伴。在这里，你可以放下所有的防备，与我分享任何话题。你现在想聊聊什么？',
        timestamp: Date.now()
      }
    ];
  });
  
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 统计计算
  const statsData = useMemo(() => {
    const targetData = statsView === 'collective' ? collectiveMoods.map(m => m.emotion) : personalMoodHistory.map(m => m.emotion);
    const stats: Record<string, number> = {
      [EmotionType.JOY]: 0, [EmotionType.CALM]: 0, [EmotionType.SORROW]: 0,
      [EmotionType.ANXIETY]: 0, [EmotionType.LOVE]: 0, [EmotionType.WONDER]: 0,
    };
    targetData.forEach(emo => {
      if (stats[emo] !== undefined) stats[emo]++;
    });
    return { stats, total: targetData.length };
  }, [collectiveMoods, personalMoodHistory, statsView]);

  useImperativeHandle(ref, () => ({
    startChatWithContext: (text: string) => {
      setMode('chat');
      setChatInput(text);
    },
    toggleHistory: () => {
      setShowHistory(prev => !prev);
    }
  }));

  useEffect(() => {
    localStorage.setItem('soul_chat_history', JSON.stringify(chatHistory));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem('personal_mood_history_v2', JSON.stringify(personalMoodHistory));
  }, [personalMoodHistory]);

  const handleSubmit = async () => {
    if (!selectedEmotion || !message || !name) return;
    setIsLoading(true);
    const reply = await getEmpathyResponse(EMOTION_LABELS[selectedEmotion], message);
    
    // 记录到本地私密历史
    setPersonalMoodHistory(prev => [...prev, { emotion: selectedEmotion, message, timestamp: Date.now() }]);
    
    setAiReply(reply);
    onNewMood(name, selectedEmotion, intensity, message);
    setIsLoading(false);
    setStep(3);
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const newHistory: Message[] = [...chatHistory, { role: 'user', text: userMsg, timestamp: Date.now() }];
    setChatHistory(newHistory);
    setIsLoading(true);
    const response = await getDeepChatResponse(newHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })) as any);
    setChatHistory([...newHistory, { role: 'model', text: response, timestamp: Date.now() }]);
    setIsLoading(false);
  };

  const clearHistory = () => {
    if (window.confirm("确定要永久尘封这些珍贵的私人记忆吗？此操作不可撤销。")) {
      setChatHistory([{ role: 'model', text: '记忆已化作星尘。', timestamp: Date.now() }]);
      setPersonalMoodHistory([]);
      localStorage.removeItem('soul_chat_history');
      localStorage.removeItem('personal_mood_history_v2');
      setShowHistory(false);
    }
  };

  const reset = () => {
    setStep(1);
    setMessage('');
    setAiReply(null);
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl h-full flex flex-col shadow-2xl transition-all duration-500 relative overflow-hidden">
      
      {/* 顶部标签切换 */}
      <div className={`flex justify-between items-center mb-6 transition-opacity duration-300 ${showHistory ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex bg-slate-950/50 p-1 rounded-full border border-white/5 w-fit">
          <button 
            onClick={() => { setMode('guide'); setShowHistory(false); }}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${mode === 'guide' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            心情分享
          </button>
          <button 
            onClick={() => setMode('chat')}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${mode === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            AI 伙伴
          </button>
        </div>
        <span className="text-[9px] text-slate-600 uppercase tracking-widest font-black">DEEP HARMONY</span>
      </div>

      {/* 侧滑统计面板 */}
      <div className={`absolute inset-0 z-[60] bg-slate-950 p-6 flex flex-col transition-all duration-700 cubic-bezier(0.4, 0, 0.2, 1) shadow-[-20px_0_80px_rgba(0,0,0,1)] ${showHistory ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                {statsView === 'collective' ? '🌐' : '🔒'}
              </div>
              <div>
                <h3 className="text-white font-serif text-lg font-bold tracking-tight">心灵灯火统计</h3>
                <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-widest font-bold">
                  {statsView === 'collective' ? `当前花园有 ${statsData.total} 位灵魂相连` : `我已留下了 ${statsData.total} 份私密心语`}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowHistory(false)} 
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 视角切换按钮 */}
          <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5 w-full mb-4 shadow-inner shrink-0">
            <button 
              onClick={() => setStatsView('collective')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${statsView === 'collective' ? 'bg-white/10 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
            >
              全花园视角
            </button>
            <button 
              onClick={() => setStatsView('personal')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${statsView === 'personal' ? 'bg-white/10 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
            >
              我的个人轨迹
            </button>
          </div>

          {/* 个人视角下的子选项 */}
          {statsView === 'personal' && (
            <div className="flex gap-2 mb-4 px-1 shrink-0">
              <button 
                onClick={() => setHistorySubTab('dist')}
                className={`text-[9px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${historySubTab === 'dist' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-600'}`}
              >
                情绪分布
              </button>
              <button 
                onClick={() => setHistorySubTab('trend')}
                className={`text-[9px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${historySubTab === 'trend' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-600'}`}
              >
                成长趋势
              </button>
            </div>
          )}

          {/* 进度条统计或趋势图 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {statsView === 'personal' && historySubTab === 'trend' ? (
              <TrendChart data={personalMoodHistory} />
            ) : (
              <div className="space-y-3 mb-6 px-2 bg-white/[0.01] p-4 rounded-2xl border border-white/[0.03]">
                {Object.values(EmotionType).map(type => {
                  const count = statsData.stats[type] || 0;
                  const percentage = statsData.total > 0 ? Math.round((count / statsData.total) * 100) : 0;
                  return (
                    <div key={type} className="flex flex-col gap-1.5 group">
                      <div className="flex justify-between items-end px-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight group-hover:text-white transition-colors">
                          {EMOTION_LABELS[type]}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 font-bold group-hover:text-white">
                          {percentage}%
                        </span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-1000 ease-out rounded-full"
                          style={{ 
                            width: `${percentage}%`, 
                            backgroundColor: MOOD_COLORS[type],
                            boxShadow: percentage > 0 ? `0 0 8px ${MOOD_COLORS[type]}66` : 'none'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 下方记录列表 */}
            <div className="space-y-4 pt-4 relative">
              <div className="flex justify-between items-center mb-2 px-1 sticky top-0 bg-slate-950 py-2 z-20">
                <h4 className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                  {statsView === 'personal' ? '🔒 心语集轴' : '💬 动态摘要'}
                </h4>
                {statsView === 'personal' && personalMoodHistory.length > 0 && (
                  <button onClick={clearHistory} className="text-[8px] text-red-500/40 hover:text-red-400 font-bold uppercase tracking-tighter">清除档案</button>
                )}
              </div>

              {statsView === 'personal' ? (
                personalMoodHistory.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-slate-700">
                    <p className="italic text-[10px] text-center px-4">尚无记录。</p>
                  </div>
                ) : (
                  [...personalMoodHistory].reverse().map((entry, i) => (
                    <div key={i} className="group/item border-l-2 border-white/5 pl-4 py-3 hover:bg-white/[0.03] transition-all rounded-r-2xl border-b border-white/[0.02]">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MOOD_COLORS[entry.emotion] }} />
                          <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter">{EMOTION_LABELS[entry.emotion]}</span>
                        </div>
                        <span className="text-[8px] text-slate-700 font-mono font-bold">{formatDate(entry.timestamp)}</span>
                      </div>
                      <p className="text-[12px] text-slate-200 font-serif italic leading-relaxed">
                        “{entry.message}”
                      </p>
                    </div>
                  ))
                )
              ) : (
                [...chatHistory].reverse().slice(0, 8).map((msg, i) => (
                  <div key={i} className="group/item border-l-2 border-white/5 pl-4 py-3 hover:bg-white/[0.02] transition-all rounded-r-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[8px] uppercase font-black tracking-widest ${msg.role === 'user' ? 'text-indigo-400' : 'text-slate-600 italic'}`}>
                        {msg.role === 'user' ? 'ME' : 'AI'}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed line-clamp-1 ${msg.role === 'user' ? 'text-slate-300' : 'text-slate-500 italic'}`}>
                      {msg.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
      </div>

      {/* 主界面内容 */}
      {mode === 'guide' ? (
        <div className="flex-1 flex flex-col z-10">
          {step === 1 && (
            <div className="space-y-6 flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-xl font-serif text-white leading-tight">此刻，你内心是何种底色？</h3>
              <input 
                type="text" placeholder="你的昵称..."
                className="bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-full shadow-inner"
                value={name} onChange={(e) => setName(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-3">
                {Object.values(EmotionType).map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => setSelectedEmotion(emotion)}
                    className={`p-3 rounded-xl transition-all border ${selectedEmotion === emotion ? 'border-white bg-white/10 shadow-lg scale-[1.03]' : 'border-white/5 bg-slate-950/40 hover:bg-slate-950/60'}`}
                  >
                    <div className="w-2 h-2 rounded-full mb-2 mx-auto" style={{ backgroundColor: MOOD_COLORS[emotion] }} />
                    <span className="text-[10px] text-slate-500 block text-center uppercase tracking-tighter font-bold">{EMOTION_LABELS[emotion]}</span>
                  </button>
                ))}
              </div>
              {selectedEmotion && <button onClick={() => setStep(2)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-3 rounded-xl transition-all shadow-lg mt-2">继续旅程</button>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 flex-1 flex flex-col animate-in fade-in slide-in-from-right-4">
              <button onClick={() => setStep(1)} className="text-slate-600 text-[10px] hover:text-white flex items-center gap-1 uppercase font-black tracking-widest">← 返回</button>
              <h3 className="text-xl font-serif text-white italic">轻轻诉说你的心事...</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1"><label className="text-[10px] text-slate-600 uppercase tracking-widest font-black">情绪强度</label><span className="text-xs text-blue-400 font-mono font-bold">{intensity}</span></div>
                <input type="range" min="1" max="10" value={intensity} onChange={(e) => setIntensity(parseInt(e.target.value))} className="w-full accent-blue-600 h-1 bg-white/5 rounded-full appearance-none cursor-pointer" />
              </div>
              <textarea
                placeholder="这一刻，你在想什么？你的诉说将指引灵魂灯火的跳动..."
                className="bg-slate-950/60 border border-white/10 rounded-xl px-4 py-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 flex-1 resize-none font-serif italic shadow-inner"
                value={message} onChange={(e) => setMessage(e.target.value)}
              />
              <button disabled={isLoading || !message} onClick={handleSubmit} className={`bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center gap-2 ${isLoading ? 'opacity-50' : ''}`}>
                {isLoading ? '深切共感中...' : '释放在虚空中'} ✨
              </button>
            </div>
          )}

          {step === 3 && aiReply && (
            <div className="space-y-8 flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
              <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center animate-pulse border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]"><span className="text-2xl">🌿</span></div>
              <div className="space-y-3 px-2">
                <h4 className="text-slate-600 text-[10px] uppercase tracking-[0.2em] font-black">回响</h4>
                <p className="text-lg font-serif text-slate-100 italic leading-relaxed">“{aiReply}”</p>
              </div>
              <button onClick={reset} className="text-slate-400 hover:text-white text-[10px] border border-white/10 px-8 py-2.5 rounded-full hover:bg-white/5 transition-all font-bold uppercase tracking-[0.15em]">新的起点</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-500 z-10">
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1 custom-scrollbar">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-lg ${
                  msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : 'bg-slate-950/60 text-slate-300 border border-white/5 rounded-bl-none italic font-serif animate-ai-breathe'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex justify-start"><div className="bg-slate-950/40 px-4 py-2.5 rounded-2xl flex gap-1.5 animate-pulse"><div className="w-1 h-1 bg-slate-600 rounded-full" /><div className="w-1 h-1 bg-slate-600 rounded-full" /><div className="w-1 h-1 bg-slate-600 rounded-full" /></div></div>}
            <div ref={chatEndRef} />
          </div>
          <div className="relative mt-auto">
            <input 
              type="text" placeholder="与你的心灵伙伴对话..."
              className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-5 py-4 text-[13px] text-white pr-14 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 shadow-2xl"
              value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
            />
            <button onClick={handleSendChatMessage} disabled={isLoading || !chatInput.trim()} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-lg">
              <span className="text-lg">🌿</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default EmpathyGuide;
