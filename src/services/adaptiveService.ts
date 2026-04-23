import { Course } from "../constants";

export type ExplanationLevel = "student" | "expert" | "child";

export interface AdaptiveState {
  attempts: number;
  lastScore: number;
  currentModuleId: string;
  currentLevel: ExplanationLevel;
}

export interface AdaptiveAction {
  action: "next" | "revisit" | "previous" | "change_level";
  nextModuleId: string;
  nextLevel: ExplanationLevel;
  message: string;
}

export function getNextStep(
  course: Course,
  state: AdaptiveState
): AdaptiveAction {
  const currentModule = course.modules.find((m) => m.id === state.currentModuleId);
  if (!currentModule) {
    return { 
      action: "next", 
      nextModuleId: course.modules[0].id, 
      nextLevel: "student",
      message: "Starting your journey!"
    };
  }

  const passThreshold = 0.8; // 80% to pass
  const isPassed = state.lastScore >= passThreshold;

  if (isPassed) {
    // Move to next module
    const nextModule = course.modules.find((m) => m.order === currentModule.order + 1);
    if (nextModule) {
      return {
        action: "next",
        nextModuleId: nextModule.id,
        nextLevel: state.currentLevel,
        message: "Great job! You've mastered this module. Let's move to the next one."
      };
    } else {
      // Course completed
      return { 
        action: "next", 
        nextModuleId: "completed", 
        nextLevel: state.currentLevel,
        message: "Congratulations! You've completed the entire course roadmap."
      };
    }
  } else {
    // Failed
    if (state.attempts >= 3) {
      // After 3 attempts, we need a significant change (Regression or Level Change)
      
      // 1. If it's not the first module, recommend going back to the previous one
      const prevModule = course.modules.find((m) => m.order === currentModule.order - 1);
      if (prevModule) {
        return { 
          action: "previous", 
          nextModuleId: prevModule.id, 
          nextLevel: state.currentLevel,
          message: `It seems Module ${currentModule.order} is challenging. Let's revisit Module ${prevModule.order} to strengthen your foundation before trying again.`
        };
      } else {
        // 2. If it IS the first module, change the explanation level
        if (state.currentLevel === "expert") {
          return { 
            action: "change_level", 
            nextModuleId: state.currentModuleId, 
            nextLevel: "student",
            message: "This module is quite technical. Let's try a standard student-level explanation to clear the basics."
          };
        } else if (state.currentLevel === "student") {
          return { 
            action: "change_level", 
            nextModuleId: state.currentModuleId, 
            nextLevel: "child",
            message: "Let's break this down into very simple terms. We'll explain it like you're learning it for the first time."
          };
        } else {
          // Already at "child" level and still failing first module
          return { 
            action: "revisit", 
            nextModuleId: state.currentModuleId, 
            nextLevel: "child",
            message: "Don't worry! Learning takes time. Let's review the simplified content once more and try the quiz again."
          };
        }
      }
    } else {
      // Less than 3 attempts, just revisit
      return { 
        action: "revisit", 
        nextModuleId: state.currentModuleId, 
        nextLevel: state.currentLevel,
        message: "You're close! Review the content and try the quiz again to reach the 80% mastery threshold."
      };
    }
  }
}
