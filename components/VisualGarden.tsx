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
    
    // 调整中心点：将重心稍微下移，为上方标题腾出更多空间
    const centerX = width * 0.5;
    const centerY = height * 0.58; 

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    
    // 滤镜
    defs.append("filter")
      .attr("id", "glow")
      .append("feGaussianBlur")
      .attr("stdDeviation", "6")
      .attr("result", "coloredBlur");

    // 背景层：暗化遮罩
    const dimmer = svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#020617") // Slate 950
      .attr("opacity", 0)
      .style("pointer-events", "none");

    const linksLayer = svg.append("g").attr("class", "links-layer");
    const nodesLayer = svg.append("g").attr("class", "nodes-layer");

    // 动态参数计算
    const count = moods.length;
    const basePadding = 12 + (28 / (1 + count * 0.1)); 
    const intensityScale = 3 + (6 / (1 + count * 0.05));

    const getCollisionRadius = (d: any) => d.intensity * intensityScale + basePadding;
    const getVisualRadius = (d: any) => {
      const base = (d.intensity * intensityScale * 0.65) + (basePadding * 0.4);
      return d.id === selectedMoodId ? base * 1.5 : base; // 选中时放大
    };

    // 更新节点固定位置逻辑
    moods.forEach((m: any) => {
      if (m.id === selectedMoodId) {
        m.fx = centerX;
        m.fy = centerY;
      } else {
        m.fx = null;
        m.fy = null;
      }
    });

    const simulation = d3.forceSimulation<any>(moods)
      .force("center", d3.forceCenter(centerX, centerY))
      .force("charge", d3.forceManyBody().strength(count > 15 ? -150 : -300))
      .force("collide", d3.forceCollide().radius((d: any) => getCollisionRadius(d) * (d.id === selectedMoodId ? 2 : 1)).iterations(3))
      .alphaDecay(0.02)
      .on("tick", () => {
        nodes.attr("transform", (d: any) => {
          const r = getVisualRadius(d);
          // 选中状态不限制边界（已固定在中心），非选中状态严格限制顶部边界以避开文字
          if (d.id !== selectedMoodId) {
            d.x = Math.max(r + 20, Math.min(width - r - 20, d.x));
            // 强化顶部限制：增加 140px 的安全区，确保不遮挡标题
            d.y = Math.max(r + 140, Math.min(height - r - 40, d.y));
          }
          return `translate(${d.x},${d.y})`;
        });
        updateLinks();
      });

    // 绘制灵魂连结线
    const updateLinks = () => {
      linksLayer.selectAll(".soul-link").remove();
      if (!selectedMoodId) return;

      const sourceNode = moods.find(m => m.id === selectedMoodId) as any;
      if (!sourceNode) return;

      const targetNodes = moods.filter(m => m.id !== selectedMoodId && m.emotion === sourceNode.emotion) as any[];
      
      linksLayer.selectAll(".soul-link")
        .data(targetNodes)
        .enter()
        .append("path")
        .attr("class", "soul-link soul-link-path")
        .attr("d", (d: any) => {
          const dx = d.x - sourceNode.x;
          const dy = d.y - sourceNode.y;
          const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
          return `M${sourceNode.x},${sourceNode.y}A${dr},${dr} 0 0,1 ${d.x},${d.y}`;
        })
        .attr("fill", "none")
        .attr("stroke", sourceNode.color)
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.3)
        .attr("filter", "url(#glow)");
    };

    // 暗化效果开关
    dimmer.transition()
      .duration(600)
      .attr("opacity", selectedMoodId ? 0.75 : 0);

    const nodes = nodesLayer.selectAll(".mood-node")
      .data(moods)
      .enter()
      .append("g")
      .attr("class", "mood-node")
      .style("cursor", "pointer")
      .on("click", function(event, d: any) {
        if (selectedMoodId === d.id) {
          setSelectedMoodId(null);
        } else {
          setSelectedMoodId(d.id);
        }
        setIsCommenting(false);
        simulation.alpha(1).restart();
      });

    const nodeContent = nodes.append("g").attr("class", "node-content");

    // 外围光晕 (Aura)
    nodeContent.append("circle")
      .attr("class", "aura-bg")
      .attr("r", (d: any) => getVisualRadius(d) * 1.3)
      .attr("fill", (d: any) => d.color)
      .attr("opacity", 0.15)
      .attr("filter", "url(#glow)");

    // 核心灯火 (Core)
    nodeContent.append("circle")
      .attr("class", "main-circle")
      .attr("r", (d: any) => getVisualRadius(d) * 0.7)
      .attr("fill", (d: any) => d.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.8)
      .attr("opacity", 0.9);

    // 文字
    nodeContent.append("text")
      .text((d: any) => d.name.charAt(0).toUpperCase())
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("fill", "#fff")
      .attr("font-size", (d: any) => `${Math.max(10, getVisualRadius(d) * 0.5)}px`)
      .attr("font-weight", "bold")
      .attr("pointer-events", "none");

    // 呼吸动画
    nodes.each(function(d: any) {
      const node = d3.select(this);
      const aura = node.select(".aura-bg");
      const core = node.select(".main-circle");
      
      const isSelected = d.id === selectedMoodId;
      const baseDuration = isSelected ? 2000 : (3500 - (d.intensity * 250));
      const pulseRange = (d.intensity * 0.6) + (isSelected ? 20 : 5);
      const baseRadius = getVisualRadius(d) * 1.3;

      function cycle() {
        aura.transition()
          .duration(baseDuration)
          .ease(d3.easeSinInOut)
          .attr("r", baseRadius + pulseRange)
          .attr("opacity", isSelected ? 0.7 : 0.25)
          .transition()
          .duration(baseDuration)
          .ease(d3.easeSinInOut)
          .attr("r", baseRadius)
          .attr("opacity", isSelected ? 0.4 : 0.15)
          .on("end", cycle);
          
        core.transition()
          .duration(baseDuration)
          .ease(d3.easeSinInOut)
          .attr("stroke-width", isSelected ? 8 : 3.5)
          .attr("stroke-opacity", 1)
          .attr("fill-opacity", 1)
          .transition()
          .duration(baseDuration)
          .ease(d3.easeSinInOut)
          .attr("stroke-width", isSelected ? 3 : 1.5)
          .attr("stroke-opacity", 0.6)
          .attr("fill-opacity", 0.8);
      }
      cycle();
    });

    return () => {
      simulation.stop();
    };
  }, [moods, selectedMoodId]);

  const showFeedback = (message: string, type: 'info' | 'success' = 'info') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleShare = async (mood: UserMood) => {
    const shareText = `我在「心语回响」花园里共鸣了：\n“${mood.message}”\n—— ${mood.name} (感到${EMOTION_LABELS[mood.emotion]})\n\n在这片星空下，每一颗心都有回响。✨`;
    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: '心语回响 - 情感连接空间',
          text: shareText,
          url: shareUrl,
        });
        showFeedback('分享成功 🌿', 'success');
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showFeedback('内容已复制到剪贴板，快去分享吧！ 🌿', 'success');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        showFeedback('无法开启分享，请手动复制 🌿');
      }
    }
  };

  const handleCommentSubmit = () => {
    if (!commentText.trim() || !commentAuthor.trim() || !selectedMood) return;
    onComment(selectedMood, commentAuthor, commentText);
    setCommentText('');
    setIsCommenting(false);
    showFeedback('回响已传达 🌿', 'success');
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl">
      {/* 顶部标题区域，添加更高层级并增加背景渐变以提升可读性 */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-slate-950/40 to-transparent z-10 pointer-events-none p-6 transition-opacity duration-500" style={{ opacity: selectedMoodId ? 0.3 : 1 }}>
        <h2 className="text-slate-500 text-[10px] font-black tracking-[0.3em] uppercase mb-1">共鸣情感花园</h2>
        <p className="text-slate-300 text-base font-serif italic max-w-md">每一个跃动的光亮，都是一颗跳动的心。</p>
      </div>
      
      {moods.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
          <p className="text-slate-500 font-serif italic text-lg">等待第一缕心语播种...</p>
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-full" onClick={(e) => {
          if (e.target === svgRef.current) setSelectedMoodId(null);
        }} />
      )}

      {selectedMood && (
        <div className="absolute inset-y-4 right-4 w-72 z-40 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col p-6 animate-in slide-in-from-right duration-500">
          <button 
            onClick={() => { setSelectedMoodId(null); setIsCommenting(false); }}
            className="self-end text-slate-500 hover:text-white transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="flex flex-col items-center text-center space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-xl transition-all duration-500"
              style={{ backgroundColor: selectedMood.color + '33', border: `3px solid ${selectedMood.color}`, boxShadow: `0 0 20px ${selectedMood.color}44` }}
            >
              {selectedMood.name.charAt(0)}
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-serif text-white font-bold">{selectedMood.name}</h3>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                当前状态：{EMOTION_LABELS[selectedMood.emotion]}
              </p>
            </div>

            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 w-full italic font-serif text-slate-200 leading-relaxed text-sm shadow-inner">
              “{selectedMood.message}”
            </div>

            <div className="w-full text-left space-y-3 pt-2">
              <div className="flex justify-between items-center border-b border-white/5 pb-1">
                <h4 className="text-[9px] text-slate-600 uppercase tracking-widest font-black">
                  最近的回响 ({selectedMood.comments?.length || 0})
                </h4>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {selectedMood.comments && selectedMood.comments.length > 0 ? (
                  selectedMood.comments.map(c => (
                    <div key={c.id} className="bg-white/[0.02] p-2 rounded-xl border border-white/[0.05] hover:bg-white/[0.04] transition-colors">
                      <div className="flex justify-between text-[8px] mb-1">
                        <span className="font-bold text-slate-400">{c.author}</span>
                        <span className="text-slate-600">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[10px] text-slate-300 font-serif leading-relaxed">{c.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[9px] text-slate-700 italic text-center py-2">尚无回响，快来留下你的温暖...</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 relative">
            {feedback && (
              <div className="absolute -top-10 left-0 right-0 text-center animate-in fade-in slide-in-from-bottom-2 z-50">
                <span className={`text-[9px] px-3 py-1 rounded-full shadow-lg ${feedback.type === 'success' ? 'bg-indigo-600' : 'bg-slate-700'} text-white`}>
                  {feedback.message}
                </span>
              </div>
            )}

            {isCommenting ? (
              <div className="space-y-2 bg-slate-950/60 p-3 rounded-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-200">
                <textarea 
                  placeholder="写下你的共鸣..." 
                  className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-white h-16 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={() => setIsCommenting(false)} className="flex-1 py-1.5 text-[9px] uppercase font-bold text-slate-500 hover:text-white transition-colors">取消</button>
                  <button onClick={handleCommentSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] uppercase font-bold py-1.5 rounded-lg transition-colors shadow-lg">提交回响</button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => onEcho(selectedMood.id)} 
                    className="bg-white/5 hover:bg-pink-500/20 text-white text-[10px] font-bold py-3 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2 group"
                  >
                    <span className="text-pink-500 group-hover:scale-125 transition-transform duration-300">♥</span> 
                    共鸣 {(selectedMood.echoCount || 0) > 0 ? selectedMood.echoCount : ''}
                  </button>
                  <button 
                    onClick={() => handleShare(selectedMood)} 
                    className="bg-white/5 hover:bg-blue-500/20 text-white text-[10px] font-bold py-3 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2 group"
                    title="分享至社交平台"
                  >
                    <span className="text-blue-400 group-hover:rotate-12 transition-transform duration-300">↗</span> 
                    分享
                  </button>
                </div>
                <button 
                  onClick={() => setIsCommenting(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold py-3 rounded-xl border border-white/5 shadow-lg transition-all"
                >
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