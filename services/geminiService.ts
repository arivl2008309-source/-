
import { GoogleGenAI, Type } from "@google/genai";

// Initialize with the API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getEmpathyResponse = async (userMood: string, userMessage: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `用户当前感到${userMood}。他们说：“${userMessage}”。
      你是一个充满慈悲心、温婉且富有共情力的心灵导师。
      请提供一段简短（2-3句话）、富有诗意且深具支持性的中文回复。
      重点在于认可他们的感受，并给予一个温柔、治愈的视角。`,
      config: {
        temperature: 0.8,
        topP: 0.9,
      }
    });

    return response.text || "我在这里，在这片静谧中倾听。你的心声已被接收。";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "繁星在倾听，你内心的回响已被宇宙温柔地环抱。";
  }
};

export const getDeepChatResponse = async (history: { role: 'user' | 'model', parts: [{ text: string }] }[]) => {
  try {
    // Upgrading to gemini-3-pro-preview for complex emotional reasoning tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: history,
      config: {
        systemInstruction: `你是一位深度共情的心灵伙伴。你不仅倾听，更愿意引导用户探索内心深处。
        你的语言应当优雅、治愈、富有哲理且亲切。
        避免使用生硬的建议，而是通过温柔的提问或富有诗意的比喻来回应。
        请始终使用中文对话。`,
        temperature: 0.9,
      }
    });

    return response.text || "在这场心灵的漫步中，我一直都在。";
  } catch (error) {
    console.error("Deep Chat Error:", error);
    return "由于宇宙尘埃的干扰，我暂时无法回应，但我始终与你同在。";
  }
};

export const analyzeEmotionalLandscape = async (moods: string[]) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `根据当前虚拟空间中大家的情绪列表：${moods.join(', ')}。
      请用一个极其简短（15字以内）且富有文学美感的中文隐喻，描述当前的“集体心灵气象”。
      
      要求：
      1. 禁止使用任何 Markdown 符号（严禁出现 ** 或 * 等）。
      2. 只返回隐喻句子本身，严禁提供任何解释、注脚或关于情绪对应关系的说明（不要出现“注：”或括号内容）。
      3. 不要包含引号。`,
      config: {
        temperature: 0.7,
      }
    });
    return response.text || "如同细雨后的初晴，万物在静默中生长。";
  } catch (error) {
    return "一片浩瀚的星空，每一盏灯火都各有归处。";
  }
};
