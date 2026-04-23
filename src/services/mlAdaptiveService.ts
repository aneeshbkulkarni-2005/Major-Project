import { GoogleGenAI, Type } from "@google/genai";
import { Course, Module } from "../constants";
import { AdaptiveAction, ExplanationLevel } from "./adaptiveService";

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is missing. Please add it to your environment variables in the Settings menu (Secrets panel).");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface HistoryItem {
  moduleId: string;
  score: number;
  attempts: number;
  level: ExplanationLevel;
  passed: boolean;
  timestamp: string;
}

export async function predictNextStep(
  course: Course,
  currentModule: Module,
  history: HistoryItem[],
  currentState: {
    attempts: number;
    lastScore: number;
    currentLevel: ExplanationLevel;
  }
): Promise<AdaptiveAction> {
  const prompt = `
    You are an AI Adaptive Sequencer for an educational platform. 
    Your goal is to decide the NEXT STEP for a student to maximize their learning efficiency and mastery.

    COURSE: ${course.title}
    CURRENT MODULE: ${currentModule.title} (Order: ${currentModule.order})
    
    STUDENT HISTORY:
    ${history.map(h => `- Module: ${h.moduleId}, Score: ${Math.round(h.score * 100)}%, Attempts: ${h.attempts}, Level: ${h.level}, Passed: ${h.passed}`).join("\n")}

    CURRENT ATTEMPT DATA:
    - Attempts on this module: ${currentState.attempts}
    - Last Score: ${Math.round(currentState.lastScore * 100)}%
    - Current Explanation Level: ${currentState.currentLevel}

    AVAILABLE ACTIONS:
    1. "next": Move to the next module (only if mastery is achieved, usually >80%).
    2. "revisit": Stay on the same module and try again (if close to passing).
    3. "previous": Go back to a previous module (if the student is consistently failing and needs foundation work).
    4. "change_level": Stay on the same module but change the explanation level (student, expert, child).

    LOGIC TO FOLLOW:
    - If score >= 80%, usually "next".
    - If score < 80% and attempts < 3, usually "revisit".
    - If attempts >= 3 and score is low, consider "change_level" to a simpler one (e.g., expert -> student, student -> child) or "previous".
    - Be encouraging in your message.

    RETURN JSON:
    {
      "action": "next" | "revisit" | "previous" | "change_level",
      "nextModuleId": "string",
      "nextLevel": "student" | "expert" | "child",
      "message": "A personalized message explaining why this step was chosen based on their performance pattern."
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ["next", "revisit", "previous", "change_level"] },
          nextModuleId: { type: Type.STRING },
          nextLevel: { type: Type.STRING, enum: ["student", "expert", "child"] },
          message: { type: Type.STRING },
        },
        required: ["action", "nextModuleId", "nextLevel", "message"],
      },
    },
  });

  return JSON.parse(response.text);
}
