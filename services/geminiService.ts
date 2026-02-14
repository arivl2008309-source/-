import { GoogleGenAI } from "@google/genai";

// 严格按照文档要求初始化，假设 process.env.API_KEY 已由环境注入
const getAi = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const getEmpathyResponse = async (userMood: string, userMessage: string) => {
  const ai = getAi();
  if (!ai) return "我在这里倾听。";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `用户感到${userMood}。他们说：“${userMessage}”。
      你是一个温婉且富有共情力的心灵导师，请用2句富有诗意的中文回复。`,
    });
    return response.text || "在这片静谧中，你的心声已被接收。";
  } catch (error) {
    return "繁星在倾听，你内心的回响已被宇宙温柔地环抱。";
  }
};

export const getDeepChatResponse = async (history: { role: 'user' | 'model', parts: [{ text: string }] }[]) => {
  const ai = getAi();
  if (!ai) return "在这场心灵的漫步中，我一直都在。";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: history,
      config: {
        systemInstruction: `你是一位深度共情的心灵伙伴。语言优雅、治愈、富有哲理。请始终使用中文。`,
      }
    });
    return response.text || "在这场心灵的漫步中，我一直都在。";
  } catch (error) {
    return "由于宇宙尘埃的干扰，我暂时无法回应，但我始终与你同在。";
  }
};

export const analyzeEmotionalLandscape = async (moods: string[]) => {
  const ai = getAi();
  if (!ai || moods.length === 0) return "一片浩瀚的星空，每一盏灯火都各有归处。";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `当前情绪：${moods.join(', ')}。请用一个15字内、无 Markdown、无引号的中文隐喻描述当前气象。`,
    });
    return response.text?.trim() || "如同细雨后的初晴，万物在静默中生长。";
  } catch (error) {
    return "一片浩瀚的星空，每一盏灯火都各有归处。";
  }
};