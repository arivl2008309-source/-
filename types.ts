
export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface UserMood {
  id: string;
  name: string;
  emotion: string;
  intensity: number; // 1-10
  color: string;
  message: string;
  timestamp: number;
  echoCount?: number;
  comments?: Comment[];
}

export interface EchoMessage {
  id: string;
  sender: string;
  content: string;
  type: 'public' | 'private' | 'ai';
  timestamp: number;
}

export enum EmotionType {
  JOY = 'JOY',
  CALM = 'CALM',
  SORROW = 'SORROW',
  ANXIETY = 'ANXIETY',
  LOVE = 'LOVE',
  WONDER = 'WONDER'
}

export const MOOD_COLORS: Record<string, string> = {
  [EmotionType.JOY]: '#fbbf24', // Amber
  [EmotionType.CALM]: '#60a5fa', // Blue
  [EmotionType.SORROW]: '#818cf8', // Indigo
  [EmotionType.ANXIETY]: '#f87171', // Red
  [EmotionType.LOVE]: '#f472b6', // Pink
  [EmotionType.WONDER]: '#a78bfa'  // Purple
};
