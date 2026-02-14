import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { UserMood, EmotionType, MOOD_COLORS } from '../types';

const EMOTION_LABELS: Record<string, string> = {
  [EmotionType.JOY]: '喜悦',
  [EmotionType.CALM]: '平和',
  [EmotionType.SORROW]: '忧伤',
  [EmotionType.ANXIETY]: '焦虑',
  [EmotionType.LOVE]: '爱意',
  [EmotionType.WONDER]: '惊叹'
};

interface VisualGardenProps {
  moods: UserMood[];
  onEcho: (id: string) => void;
  onComment: (mood: UserMood, author: string, text: string) => void;
  currentUserName?: string;
}

const VisualGarden: React.FC<VisualGardenProps> = ({ moods, onEcho, onComment, currentUserName }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'info' | 'success' } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState(currentUserName || '');
  const [isCommenting, setIsCommenting] = useState(false);

  const selectedMood = moods.find(m => m.id === selectedMoodId);

  // Sync internal identification state when external identification changes
  useEffect(() => {
    if (currentUserName && currentUserName !== commentAuthor) {
      setCommentAuthor(currentUserName);
    }
  }, [currentUserName]);

  useEffect(() => {
    if (!svgRef.current || moods.length === 0) {
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll("*").remove();
      }
      return;
    }

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const centerX = width * 0.55;
    const centerY = height * 0.55;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // 定义滤镜
    const defs = svg.append("defs");
    
    // 基础模糊滤镜
    defs.append("filter")
      .attr("id", "glow")
      .append("feGaussianBlur")
      .attr("stdDeviation", "8")
      .attr("result", "coloredBlur");

    const g = svg.append("g");

    // 避让区域设置 (左上角文字区域)
    const avoidWidth = 380;
    const avoidHeight = 130;

    // --- 优化后的动态间距调整逻辑 ---
    const count = moods.length;
    
    // 使用非线性缩放 (Logistic-like decay) 使其在心情极少或极多时都表现自然
    // 数量多时，基础间隙(Padding)从 ~40 降至 ~10
    const basePadding = 8 + (32 / (1 + count * 0.08)); 
    
    // 强度缩放系数：数量多时，大球会相应缩小以容纳更多节点，从 ~9 降至 ~3
    const intensityScale = 2.8 + (6.2 / (1 + count * 0.05));

    // 计算碰撞半径：用于力导向图，确保球体之间有物理间距
    const getCollisionRadius = (d: any) => d.intensity * intensityScale + basePadding;
    
    // 计算视觉半径：实际绘制的大小，通常小于碰撞半径以留出视觉呼吸感
    const getVisualRadius = (d: any) => (d.intensity * intensityScale * 0.65) + (basePadding * 0.4);

    // Simulation setup
    const simulation = d3.forceSimulation<any>(moods)
      .force("center", d3.forceCenter(centerX, centerY))
      // 动态电荷力：节点越多，斥力越小，避免过度发散
      .force("charge", d3.forceManyBody().strength(count > 20 ? -100 - (count * 2) : -250))
      // 碰撞力：使用 getCollisionRadius 确保间距
      .force("collide", d3.forceCollide().radius((d: any) => getCollisionRadius(d) * 1.05).iterations(2)) 
      .on("tick", () => {
        nodes.attr("transform", (d: any) => {
          const r = getVisualRadius(d); 
          // 边界限制
          let tx = Math.max(r, Math.min(width - r, d.x));
          let ty = Math.max(r, Math.min(height - r, d.y));

          // 避让左上角标题区域
          if (tx < avoidWidth && ty < avoidHeight) {
            const distToRight = avoidWidth - tx;
            const distToBottom = avoidHeight - ty;
            if (distToRight < distToBottom) {
              tx = avoidWidth + r;
            } else {
              ty = avoidHeight + r;
            }
          }

          d.x = tx;
          d.y = ty;
          return `translate(${d.x},${d.y})`;
        });
      });

    const nodes = g.selectAll(".mood-node")
      .data(moods)
      .enter()
      .append("g")
      .attr("class", "mood-node")
      .style("cursor", "pointer")
      .on("click", function(event, d: any) {
        setSelectedMoodId(d.id);
        setIsCommenting(false);

        // 弹跳动画
        const dx = centerX - d.x;
        const dy = centerY - d.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const jumpDist = 20;
        const moveX = (dx / (dist || 1)) * jumpDist;
        const moveY = (dy / (dist || 1)) * jumpDist;

        d3.select(this).select(".node-content")
          .transition()
          .duration(150)
          .ease(d3.easeCubicOut)
          .attr("transform", `translate(${moveX}, ${moveY}) scale(1.1)`)
          .transition()
          .duration(400)
          .ease(d3.easeElasticOut.amplitude(1).period(0.3))
          .attr("transform", "translate(0,0) scale(1)");
      })
      .on("mouseenter", function(event, d: any) {
        const node = d3.select(this);
        const hoverR = getVisualRadius(d) * 1.5;
        
        node.select(".aura-bg")
          .interrupt()
          .transition()
          .duration(400)
          .attr("r", hoverR)
          .attr("opacity", 0.7);

        node.select(".main-circle")
          .interrupt()
          .transition()
          .duration(300)
          .attr("stroke-width", 6)
          .attr("opacity", 1);
          
        node.select(".node-content")
          .transition()
          .duration(300)
          .attr("transform", "scale(1.15)");

        node.select(".hover-label")
          .interrupt()
          .transition()
          .duration(400)
          .attr("opacity", 1)
          .attr("transform", "translate(0, -10)");
      })
      .on("mouseleave", function(event, d: any) {
        const node = d3.select(this);
        node.select(".node-content")
          .transition()
          .duration(400)
          .attr("transform", "scale(1)");
        
        node.select(".hover-label")
          .interrupt()
          .transition()
          .duration(300)
          .attr("opacity", 0)
          .attr("transform", "translate(0, 0)");

        triggerBreathe(node);
      });

    const nodeContent = nodes.append("g").attr("class", "node-content");

    // 1. Aura
    nodeContent.append("circle")
      .attr("class", "aura-bg")
      .attr("r", (d: any) => getVisualRadius(d) * 1.2)
      .attr("fill", (d: any) => d.color)
      .attr("opacity", 0.15)
      .attr("filter", "url(#glow)");

    // 2. Track
    nodeContent.append("circle")
      .attr("r", (d: any) => getVisualRadius(d))
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.05)")
      .attr("stroke-width", 2);

    // 3. Progress Arc
    nodeContent.append("path")
      .attr("d", (d: any) => {
        const r = getVisualRadius(d);
        const arc = d3.arc()
          .innerRadius(r - 1.5)
          .outerRadius(r + 1.5)
          .startAngle(0)
          .endAngle((d.intensity / 10) * 2 * Math.PI);
        return arc(d as any);
      })
      .attr("fill", (d: any) => d.color);

    // 4. Main Circle (The Lantern Core with Breathing effect)
    nodeContent.append("circle")
      .attr("class", "main-circle")
      .attr("r", (d: any) => getVisualRadius(d) * 0.6)
      .attr("fill", (d: any) => d.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("opacity", 0.9);

    // 5. Text (Center Letter)
    nodeContent.append("text")
      .text((d: any) => d.name.charAt(0).toUpperCase())
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("fill", "#fff")
      .attr("font-size", (d: any) => `${Math.max(9, getVisualRadius(d) * 0.45)}px`)
      .attr("font-weight", "bold")
      .attr("pointer-events", "none");

    // 6. Hover Label (Subtle Tooltip)
    const hoverLabels = nodeContent.append("g")
      .attr("class", "hover-label")
      .attr("opacity", 0)
      .attr("pointer-events", "none");

    hoverLabels.append("text")
      .attr("text-anchor", "middle")
      .attr("y", (d: any) => -(getVisualRadius(d) + 12))
      .attr("fill", "#fff")
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.5)")
      .text((d: any) => `${d.name} · ${EMOTION_LABELS[d.emotion]}`);

    // 呼吸灯核心逻辑：根据情绪强度调节节奏
    function triggerBreathe(selection: d3.Selection<any, any, any, any>) {
      selection.each(function(d: any) {
        const aura = d3.select(this).select(".aura-bg");
        const core = d3.select(this).select(".main-circle");
        
        const isSelected = d.id === selectedMoodId;
        const baseDuration = 4000 - (d.intensity * 250); // 强度越高，频率越快
        const pulseRange = (d.intensity * 0.4) + (isSelected ? 12 : 5);
        const baseRadius = getVisualRadius(d) * 1.2;
        const coreBaseRadius = getVisualRadius(d) * 0.6;

        function cycle() {
          // 外围光晕脉动
          aura.transition()
            .duration(baseDuration)
            .ease(d3.easeSinInOut)
            .attr("r", baseRadius + pulseRange)
            .attr("opacity", isSelected ? 0.65 : 0.3)
            .transition()
            .duration(baseDuration)
            .ease(d3.easeSinInOut)
            .attr("r", baseRadius)
            .attr("opacity", isSelected ? 0.35 : 0.15);
            
          // 核心灯火脉动（动态调整大小与透明度，模拟呼吸）
          core.transition()
            .duration(baseDuration)
            .ease(d3.easeSinInOut)
            .attr("r", coreBaseRadius * 1.15) 
            .attr("stroke-opacity", 1)
            .attr("stroke-width", isSelected ? 5 : 3)
            .attr("opacity", 1) 
            .transition()
            .duration(baseDuration)
            .ease(d3.easeSinInOut)
            .attr("r", coreBaseRadius) 
            .attr("stroke-opacity", 0.4)
            .attr("stroke-width", isSelected ? 2.5 : 1.5)
            .attr("opacity", 0.7)
            .on("end", cycle);
        }
        cycle();
      });
    }

    // 初始化所有节点的呼吸
    nodes.call(triggerBreathe);

    return () => {
      simulation.stop();
    };
  }, [moods, selectedMoodId]);

  const showFeedback = (message: string, type: 'info' | 'success' = 'info') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleShare = async (mood: UserMood) => {
    const shareText = `我在“心语回响”花园里看到了一条令人共鸣的心语：\n\n“${mood.message}”\n—— ${mood.name} (感到${EMOTION_LABELS[mood.emotion]})\n\n在这里，每一盏光亮，都是一份心语。✨`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: '心语回响 - 情感共鸣空间',
          text: shareText,
          url: window.location.href,
        });
        showFeedback('分享成功 ✨', 'success');
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText + "\n" + window.location.href);
        showFeedback('内容已存至剪贴板 🌿', 'success');
      } catch (err) {
        showFeedback('暂无法完成分享', 'info');
      }
    }
  };

  const handleCommentSubmit = () => {
    if (!commentText.trim() || !commentAuthor.trim() || !selectedMood) return;
    onComment(selectedMood, commentAuthor, commentText);
    setCommentText('');
    setIsCommenting(false);
    showFeedback('回复已传达 🌿', 'success');
  };

  const handleEchoClick = (id: string) => {
    onEcho(id);
    showFeedback('已传递一份共鸣能量 ✨', 'success');
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl group">
      <div className="absolute top-6 left-6 z-10 pointer-events-none transition-opacity duration-300 group-hover:opacity-60">
        <h2 className="text-slate-400 text-sm font-medium tracking-widest uppercase">共鸣情感花园</h2>
        <p className="text-white text-lg font-serif italic">每一盏光亮，都是一份心语。触碰灵魂，看它起舞。</p>
      </div>
      
      {moods.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-1000">
          <div className="w-24 h-24 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 animate-float">
             <span className="text-4xl">🌱</span>
          </div>
          <p className="text-slate-400 font-serif italic text-xl max-w-md leading-relaxed">
            “花园空旷，等待第一缕心语的播种。<br/>点击右侧的‘心情分享’开始。”
          </p>
          <div className="mt-8 w-40 h-[1px] bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-full" />
      )}

      {/* Detail Panel Drawer */}
      {selectedMood && (
        <div className="absolute inset-y-0 right-0 w-80 z-40 bg-slate-900/80 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col p-8 animate-in slide-in-from-right duration-500">
          <button 
            onClick={() => { setSelectedMoodId(null); setIsCommenting(false); }}
            className="self-end text-slate-500 hover:text-white transition-colors mb-4 p-2 -mr-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex flex-col items-center text-center space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div 
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg relative shrink-0"
              style={{ backgroundColor: selectedMood.color + '44', border: `2px solid ${selectedMood.color}` }}
            >
              <div 
                className="absolute inset-0 rounded-full animate-pulse opacity-40" 
                style={{ boxShadow: `0 0 40px ${selectedMood.color}` }}
              />
              {selectedMood.name.charAt(0)}
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-serif text-white font-bold">{selectedMood.name}</h3>
              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedMood.color }} />
                <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                  {EMOTION_LABELS[selectedMood.emotion]} (强度 {selectedMood.intensity})
                </span>
              </div>
              {selectedMood.echoCount ? (
                <div className="text-[10px] text-pink-400 mt-1 uppercase tracking-tighter">
                  已获得 {selectedMood.echoCount} 次心灵共鸣
                </div>
              ) : null}
            </div>

            <div className="bg-white/5 p-6 rounded-2xl border border-white/5 w-full relative">
              <svg className="absolute top-4 left-4 h-6 w-6 text-white/10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 7.55228 14.017 7V5C14.017 4.44772 14.4647 4 15.017 4H21.017C21.5693 4 22.017 4.44772 22.017 5V15C22.017 17.7614 19.7784 20 17.017 20H14.017V21ZM5.017 21L5.017 18C5.017 16.8954 5.91243 16 7.017 16H10.017C10.5693 16 11.017 15.5523 11.017 15V9C11.017 8.44772 10.5693 8 10.017 8H6.017C5.46472 8 5.017 7.55228 5.017 7V5C5.017 4.44772 5.46472 4 6.017 4H12.017C12.5693 4 13.017 4.44772 13.017 5V15C13.017 17.7614 10.7784 20 8.017 20H5.017V21Z" />
              </svg>
              <p className="text-slate-200 font-serif italic text-lg leading-relaxed pt-4">
                {selectedMood.message}
              </p>
            </div>

            {/* Comments List Section - Made independently scrollable */}
            <div className="w-full text-left space-y-4">
              <h4 className="text-[10px] text-slate-500 uppercase tracking-widest font-black border-b border-white/5 pb-2 px-1">
                回响评论 ({selectedMood.comments?.length || 0})
              </h4>
              <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                {selectedMood.comments && selectedMood.comments.length > 0 ? (
                  selectedMood.comments.map(c => (
                    <div key={c.id} className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.05] animate-in fade-in slide-in-from-left-2">
                       <div className="flex justify-between items-center mb-1">
                         <span className="text-[10px] font-bold text-slate-300">{c.author}</span>
                         <span className="text-[8px] text-slate-600">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                       </div>
                       <p className="text-[12px] text-slate-400 italic font-serif leading-snug">{c.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-slate-700 italic px-2">暂无回响，等待第一声共鸣。</p>
                )}
              </div>
            </div>

            <div className="text-[10px] text-slate-500 uppercase tracking-widest pb-4">
              记录于 {new Date(selectedMood.timestamp).toLocaleString()}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 relative shrink-0">
            {feedback && (
              <div className="absolute -top-12 left-0 right-0 text-center animate-in fade-in slide-in-from-bottom-2 z-50">
                <span className={`text-[11px] px-4 py-1.5 rounded-full shadow-xl backdrop-blur-md border ${
                  feedback.type === 'success' 
                  ? 'bg-indigo-600/90 text-white border-white/20' 
                  : 'bg-slate-800/90 text-slate-200 border-white/10'
                }`}>
                  {feedback.message}
                </span>
              </div>
            )}

            {isCommenting ? (
              <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-white/10 animate-in zoom-in-95">
                {!currentUserName && (
                  <input 
                    type="text" 
                    placeholder="你的昵称" 
                    className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                  />
                )}
                {currentUserName && (
                  <div className="px-1 flex items-center justify-between">
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">以 {currentUserName} 身份回响</span>
                    <button onClick={() => setCommentAuthor('')} className="text-[8px] text-indigo-400 underline uppercase font-black">更改昵称</button>
                  </div>
                )}
                <textarea 
                  placeholder="说点什么共鸣的话..." 
                  className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-2 text-xs text-white h-20 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsCommenting(false)}
                    className="flex-1 py-2 text-[10px] uppercase font-bold text-slate-500 hover:text-white transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleCommentSubmit}
                    disabled={!commentText.trim() || !commentAuthor.trim()}
                    className="flex-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] uppercase font-bold py-2 px-6 rounded-lg transition-all"
                  >
                    发送回响
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleEchoClick(selectedMood.id)}
                    className="bg-white/5 hover:bg-white/10 active:scale-95 text-white text-xs font-bold py-3 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    共鸣
                  </button>
                  <button 
                    onClick={() => handleShare(selectedMood)}
                    className="bg-white/5 hover:bg-white/10 active:scale-95 text-white text-xs font-bold py-3 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    分享
                  </button>
                </div>
                <button 
                  className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-white text-xs font-bold py-3.5 rounded-xl transition-all border border-white/5 shadow-lg flex items-center justify-center gap-2"
                  onClick={() => setIsCommenting(true)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  撰写回响
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualGarden;