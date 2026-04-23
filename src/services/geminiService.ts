import { GoogleGenAI, Type } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is missing. Please add it to your environment variables in the Settings menu (Secrets panel).");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface YouTubeVideo {
  title: string;
  videoId: string;
  thumbnail?: string;
}

export interface SubmoduleContent {
  title: string;
  explanation: string;
  examples: string[];
  practice: string;
  videos: YouTubeVideo[];
}

export interface ModuleContent {
  title: string;
  explanation: string;
  level: string;
}

export type SkillCategory = "Theory" | "Practical Coding" | "Problem Solving";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  moduleId?: string;
  category: SkillCategory;
}

export async function generateModuleContent(
  topic: string,
  level: "student" | "expert" | "child"
): Promise<ModuleContent> {
  const levelDescriptions = {
    child: "Explain it like I'm 5 years old. Use very simple language, fun analogies, and avoid all technical jargon.",
    student: "Explain it like a high school or early college student. Use clear language and standard terminology.",
    expert: "Explain it like a professional. Use technical terminology and deep theoretical concepts."
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert educator. Generate a HIGH-LEVEL OVERVIEW for the module: "${topic}". 
      
      AUDIENCE LEVEL: ${level.toUpperCase()}
      DESCRIPTION: ${levelDescriptions[level]}

      STRUCTURE REQUIREMENTS:
      1. TITLE: A professional title for the module.
      2. OVERVIEW: A high-level overview of the topic, explaining its importance and what will be covered in the submodules.
      
      Format the output as a valid JSON object with "title", "explanation", and "level" fields.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            explanation: { type: Type.STRING },
            level: { type: Type.STRING },
          },
          required: ["title", "explanation", "level"],
        },
      },
    });

    if (!response.text) throw new Error("Empty response from AI");
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating module content:", error);
    return {
      title: topic,
      explanation: `Overview for ${topic} at ${level} level.`,
      level: level
    };
  }
}

export async function generateSubmoduleContent(
  moduleTopic: string,
  submoduleTopic: string,
  level: "student" | "expert" | "child",
  attempt: number = 1
): Promise<SubmoduleContent> {
  const levelDescriptions = {
    child: "Explain like I'm 5. Simple analogies, no jargon.",
    student: "Clear, standard terminology, practical examples.",
    expert: "Professional level, deep technical details."
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert educator. Generate detailed learning content for the submodule: "${submoduleTopic}" which is part of the module: "${moduleTopic}".
      
      AUDIENCE LEVEL: ${level.toUpperCase()}
      DESCRIPTION: ${levelDescriptions[level]}
      ATTEMPT NUMBER: ${attempt}

      ${attempt > 1 ? `VARIETY REQUIREMENT: This is attempt #${attempt}. Provide a FRESH PERSPECTIVE. Use different analogies, new examples, and focus on potential areas of confusion that might have caused previous failures. Do not repeat the same explanation as before.` : ""}

      STRUCTURE REQUIREMENTS:
      1. TITLE: Submodule title.
      2. EXPLANATION: Detailed, in-depth explanation of the submodule topic.
      3. EXAMPLES: 2-3 practical code examples or scenarios (Markdown).
      4. PRACTICE: A small practice exercise or thought experiment.
      5. VIDEOS: 1-2 highly relevant YouTube video recommendations (Search for actual videos).

      Format the output as a valid JSON object with "title", "explanation", "examples", "practice", and "videos" fields.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            explanation: { type: Type.STRING },
            examples: { type: Type.ARRAY, items: { type: Type.STRING } },
            practice: { type: Type.STRING },
            videos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  videoId: { type: Type.STRING },
                },
                required: ["title", "videoId"],
              },
            },
          },
          required: ["title", "explanation", "examples", "practice", "videos"],
        },
      },
    });

    if (!response.text) throw new Error("Empty response");
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating submodule content:", error);
    return {
      title: submoduleTopic,
      explanation: "Content generation failed.",
      examples: [],
      practice: "Try again later.",
      videos: []
    };
  }
}

export async function generateSubmoduleQuiz(
  topic: string,
  content: string,
  level: string,
  attempt: number = 1
): Promise<QuizQuestion[]> {
  const prompt = `Generate a 10-question multiple-choice quiz for the submodule: "${topic}" at a ${level} level.
  
  ATTEMPT NUMBER: ${attempt}
  ${attempt > 1 ? "VARIETY REQUIREMENT: This is a re-attempt. Generate entirely NEW questions. Do not repeat questions from previous attempts. Focus on different aspects of the content to ensure comprehensive understanding." : ""}

  BASE THE QUESTIONS ON THIS CONTENT:
  ---
  ${content}
  ---

  Format the output as a JSON array of objects with "question", "options", "correctIndex", "explanation", and "category" fields.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctIndex: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              category: { 
                type: Type.STRING,
                enum: ["Theory", "Practical Coding", "Problem Solving"]
              },
            },
            required: ["question", "options", "correctIndex", "explanation", "category"],
          },
        },
      },
    });

    if (!response.text) throw new Error("Empty response");
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating submodule quiz:", error);
    return [];
  }
}

export async function generateQuiz(
  topic: string,
  level: string,
  moduleContent: string,
  previousMistakes?: string[]
): Promise<QuizQuestion[]> {
  const prompt = `Generate a 20-question multiple-choice quiz for the topic: "${topic}" at a ${level} level. 
  
  BASE THE QUESTIONS STRICTLY ON THIS CONTENT:
  ---
  ${moduleContent}
  ---

  ADAPTIVE LEARNING FOCUS:
  ${previousMistakes && previousMistakes.length > 0 
    ? `The student previously struggled with these specific concepts or questions:
    ${previousMistakes.map(m => `- ${m}`).join("\n")}
    
    TASK: Generate new, varied questions that specifically target these weak areas. 
    Try to understand the underlying misconception and test it from different angles. 
    Do not repeat the exact same questions, but probe the same knowledge areas more deeply.` 
    : "Ensure a broad and balanced coverage of all key concepts mentioned in the content."}

  FORMATTING:
  - Each question should have 4 options.
  - Include a "correctIndex" (0-3).
  - Include a "explanation" field explaining the logic behind the correct answer to help the student learn from the mistake.
  - Include a "category" field which MUST be one of: "Theory", "Practical Coding", or "Problem Solving".
  
  The quiz should be challenging, unique, and designed to ensure mastery.
  Format the output as a JSON array of objects with "question", "options", "correctIndex", "explanation", and "category" fields.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              correctIndex: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              category: { 
                type: Type.STRING,
                enum: ["Theory", "Practical Coding", "Problem Solving"]
              },
            },
            required: ["question", "options", "correctIndex", "explanation", "category"],
          },
        },
      },
    });

    if (!response.text) {
      throw new Error("Empty response from AI for quiz");
    }

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating quiz:", error);
    // Return a simple fallback question if AI fails
    return [{
      question: `What is the primary focus of ${topic}?`,
      options: ["Concept A", "Concept B", "Concept C", "Concept D"],
      correctIndex: 0,
      explanation: "This is a placeholder question because the AI encountered an error generating the quiz.",
      category: "Theory"
    }];
  }
}

export async function generateBaselineQuiz(
  courseTitle: string,
  role: string,
  level: string,
  modules: { id: string, title: string }[]
): Promise<QuizQuestion[]> {
  const prompt = `Generate a diagnostic baseline assessment quiz for the course: "${courseTitle}" (Role: ${role}) at the ${level.toUpperCase()} level.
  
  The course consists of the following modules:
  ${modules.map(m => `- ${m.title} (ID: ${m.id})`).join("\n")}

  GOAL: Generate exactly TWO questions for EACH module listed above to assess the student's current knowledge of that specific skill at the ${level} level.
  
  FORMATTING:
  - Total questions: ${modules.length * 2} (two per module).
  - Each question should have 4 options.
  - Include a "correctIndex" (0-3).
  - Include an "explanation" field.
  - IMPORTANT: Add a "moduleId" field to each question object matching the ID provided above.
  - Include a "category" field which MUST be one of: "Theory", "Practical Coding", or "Problem Solving".
  
  Format the output as a JSON array of objects with "question", "options", "correctIndex", "explanation", "moduleId", and "category" fields.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              correctIndex: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              moduleId: { type: Type.STRING },
              category: { 
                type: Type.STRING,
                enum: ["Theory", "Practical Coding", "Problem Solving"]
              },
            },
            required: ["question", "options", "correctIndex", "explanation", "moduleId", "category"],
          },
        },
      },
    });

    if (!response.text) throw new Error("Empty response");
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating baseline quiz:", error);
    // Return fallback questions for each module
    return modules.map(m => ({
      question: `What is a fundamental concept in ${m.title}?`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctIndex: 0,
      explanation: "Diagnostic question.",
      moduleId: m.id,
      category: "Theory"
    }));
  }
}

export async function generateFinalQuiz(
  courseTitle: string,
  modules: string[]
): Promise<QuizQuestion[]> {
  const prompt = `Generate a 30-question comprehensive final exam for the course: "${courseTitle}".
  
  TOPICS COVERED:
  ${modules.map(m => `- ${m}`).join("\n")}
  
  GOAL: Test overall mastery of all modules in the course.
  
  FORMATTING:
  - Each question should have 4 options.
  - Include a "correctIndex" (0-3).
  - Include a "explanation" field.
  
  Format the output as a JSON array of objects with "question", "options", "correctIndex", and "explanation" fields.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              correctIndex: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
            },
            required: ["question", "options", "correctIndex", "explanation"],
          },
        },
      },
    });

    if (!response.text) throw new Error("Empty response");
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating final quiz:", error);
    // Return a simple fallback question if AI fails
    return [{
      question: `What is the primary objective of the ${courseTitle} course?`,
      options: ["Mastering core concepts", "Learning basic syntax", "Building advanced projects", "All of the above"],
      correctIndex: 3,
      explanation: "This is a placeholder question because the AI encountered an error generating the final exam.",
      category: "Theory"
    }];
  }
}
