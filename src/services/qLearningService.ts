import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Course, Module } from "../constants";
import { ExplanationLevel, AdaptiveAction } from "./adaptiveService";

// Q-Learning Parameters
const ALPHA = 0.1; // Learning rate
const GAMMA = 0.9; // Discount factor
const EPSILON = 0.1; // Exploration rate

export interface QState {
  moduleOrder: number;
  level: number; // 0: child, 1: student, 2: expert
  attempts: number; // Number of attempts on current module/submodule
  performance: number; // 0: low, 1: medium, 2: high
}

export interface QAction {
  type: "next" | "revisit" | "previous" | "change_level";
  targetLevel: number;
  moduleOffset: number; // -1, 0, 1
}

const LEVELS: ExplanationLevel[] = ["child", "student", "expert"];

function stateToKey(state: QState): string {
  return `${state.moduleOrder}_${state.level}_${state.attempts}_${state.performance}`;
}

function actionToKey(action: QAction): string {
  return `${action.type}_${action.targetLevel}_${action.moduleOffset}`;
}

export async function getQTable(userId: string): Promise<Record<string, Record<string, number>>> {
  const qTableDoc = await getDoc(doc(db, "q_tables", userId));
  if (qTableDoc.exists()) {
    return qTableDoc.data().table || {};
  }
  return {};
}

export async function saveQTable(userId: string, table: Record<string, Record<string, number>>) {
  await setDoc(doc(db, "q_tables", userId), { table }, { merge: true });
}

export function getPerformanceCategory(score: number): number {
  if (score >= 0.8) return 2;
  if (score >= 0.5) return 1;
  return 0;
}

export function levelToNumber(level: ExplanationLevel): number {
  switch (level) {
    case "child": return 0;
    case "student": return 1;
    case "expert": return 2;
    default: return 1;
  }
}

export function getQState(moduleOrder: number, level: ExplanationLevel, attempts: number, score: number): QState {
  return {
    moduleOrder,
    level: levelToNumber(level),
    attempts,
    performance: getPerformanceCategory(score)
  };
}

export async function predictNextStepQLearning(
  userId: string,
  course: Course,
  currentModule: Module,
  currentLevel: ExplanationLevel,
  lastScore: number,
  attempts: number = 1,
  isSubmodule: boolean = false
): Promise<AdaptiveAction> {
  const qTable = await getQTable(userId);
  
  const state: QState = {
    moduleOrder: currentModule.order,
    level: levelToNumber(currentLevel),
    attempts: attempts,
    performance: getPerformanceCategory(lastScore)
  };
  
  const stateKey = stateToKey(state);
  const actions: QAction[] = [];
  
  // Possible actions
  for (let l = 0; l < 3; l++) {
    for (let o = -1; o <= 1; o++) {
      // Boundaries
      if (isSubmodule) {
        // For submodules, we stay within the module usually, or move to next module if at end
        // But for simplicity in this virtualized order, we just check the order bounds
        if (currentModule.order === 11 && o === -1) continue; // First submodule of first module
      } else {
        if (currentModule.order === 1 && o === -1) continue;
        if (currentModule.order === course.modules.length && o === 1) continue;
      }
      
      if (state.performance === 2 && o === -1) continue;
      
      let type: "next" | "revisit" | "previous" | "change_level" = "revisit";
      if (o === 1) type = "next";
      else if (o === -1) type = "previous";
      else if (l !== state.level) type = "change_level";

      actions.push({ type, targetLevel: l, moduleOffset: o });
    }
  }

  let selectedAction: QAction;
  
  if (Math.random() < EPSILON) {
    selectedAction = actions[Math.floor(Math.random() * actions.length)];
  } else {
    let maxQ = -Infinity;
    let bestActions: QAction[] = [];
    const stateQValues = qTable[stateKey] || {};
    for (const action of actions) {
      const aKey = actionToKey(action);
      const qValue = stateQValues[aKey] || 0;
      if (qValue > maxQ) {
        maxQ = qValue;
        bestActions = [action];
      } else if (qValue === maxQ) {
        bestActions.push(action);
      }
    }
    selectedAction = bestActions[Math.floor(Math.random() * bestActions.length)];
  }

  const nextModuleOrder = currentModule.order + selectedAction.moduleOffset;
  let nextModuleId = currentModule.id;
  
  if (isSubmodule) {
    // Virtualized order: moduleOrder * 10 + subIndex + 1
    const currentModOrder = Math.floor(currentModule.order / 10);
    const nextSubIndex = (nextModuleOrder % 10) - 1;
    const parentModule = course.modules.find(m => m.order === currentModOrder);
    
    if (parentModule && parentModule.submodules[nextSubIndex]) {
      nextModuleId = parentModule.submodules[nextSubIndex].id;
    } else if (selectedAction.moduleOffset === 1) {
      // Move to next module if submodules exhausted
      const nextMod = course.modules.find(m => m.order === currentModOrder + 1);
      if (nextMod) nextModuleId = nextMod.id;
    }
  } else {
    const nextMod = course.modules.find(m => m.order === nextModuleOrder);
    if (nextMod) nextModuleId = nextMod.id;
  }

  const nextLevel = LEVELS[selectedAction.targetLevel];
  
  const messages = {
    next: "Excellent progress! The AI has determined you're ready for the next challenge.",
    revisit: "Let's reinforce this topic. The AI suggests one more review to solidify your understanding.",
    previous: "The AI recommends revisiting a foundational topic to help you overcome current challenges.",
    change_level: `The AI is adjusting the explanation style to ${nextLevel} mode to better suit your current learning pace.`
  };

  return {
    action: selectedAction.type,
    nextModuleId: nextModuleId,
    nextLevel: nextLevel,
    message: messages[selectedAction.type]
  };
}

export async function updateQTable(
  userId: string,
  prevState: QState,
  action: QAction,
  currentScore: number,
  nextState: QState
) {
  const qTable = await getQTable(userId);
  const sKey = stateToKey(prevState);
  const aKey = actionToKey(action);
  const nsKey = stateToKey(nextState);
  
  if (!qTable[sKey]) qTable[sKey] = {};
  if (!qTable[nsKey]) qTable[nsKey] = {};
  
  const currentQ = qTable[sKey][aKey] || 0;
  
  // Reward function
  let reward = 0;
  if (nextState.performance === 2) reward += 20; // High reward for mastery
  if (nextState.performance === 1) reward += 5;
  if (nextState.performance === 0) reward -= 10; // Penalty for failure
  
  // Progress bonus
  if (action.moduleOffset === 1 && nextState.performance >= 1) reward += 15;
  if (action.moduleOffset === 0 && nextState.performance === 2) reward -= 5; // Discourage staying if mastered
  
  // Penalty for high attempts
  if (nextState.attempts > 1) reward -= (nextState.attempts * 2);
  
  // Max Q for next state
  const nextStateActions = Object.values(qTable[nsKey]);
  const maxNextQ = nextStateActions.length > 0 ? Math.max(...nextStateActions) : 0;
  
  // Q-Learning Formula: Q(s,a) = Q(s,a) + alpha * (reward + gamma * max(Q(s',a')) - Q(s,a))
  const newQ = currentQ + ALPHA * (reward + GAMMA * maxNextQ - currentQ);
  
  qTable[sKey][aKey] = newQ;
  
  await saveQTable(userId, qTable);
}
