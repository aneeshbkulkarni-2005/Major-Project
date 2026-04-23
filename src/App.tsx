import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  onSnapshot,
  writeBatch,
  getDocs,
  arrayUnion,
  increment
} from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { 
  BookOpen, 
  CheckCircle, 
  ChevronRight, 
  GraduationCap, 
  Layout, 
  LogOut, 
  Play, 
  RotateCcw, 
  Trophy, 
  User,
  Brain,
  Zap,
  Target,
  ArrowLeft,
  Mail,
  Lock,
  Settings,
  History,
  Award,
  BarChart,
  Youtube,
  ExternalLink
} from "lucide-react";
import { COURSES, Course, Module, Submodule } from "./constants";
import { 
  generateModuleContent, 
  generateSubmoduleContent,
  generateQuiz, 
  generateSubmoduleQuiz,
  generateBaselineQuiz,
  generateFinalQuiz,
  QuizQuestion, 
  ModuleContent,
  SubmoduleContent
} from "./services/geminiService";
import { getNextStep, AdaptiveState, ExplanationLevel, AdaptiveAction } from "./services/adaptiveService";
import { predictNextStep, HistoryItem } from "./services/mlAdaptiveService";
import { 
  predictNextStepQLearning, 
  updateQTable, 
  levelToNumber, 
  getPerformanceCategory,
  getQState
} from "./services/qLearningService";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentCourse, setCurrentCourse] = useState<Course | null>(null);
  const [currentModule, setCurrentModule] = useState<Module | null>(null);
  const [currentSubmodule, setCurrentSubmodule] = useState<Submodule | null>(null);
  const [view, setView] = useState<"selection" | "difficulty" | "roadmap" | "content" | "quiz" | "result" | "profile" | "auth" | "baseline" | "final" | "confidence" | "shifting" | "self_rate" | "submodule_content">("selection");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selfRatedLevel, setSelfRatedLevel] = useState<"Expert" | "Intermediate" | "Beginner" | null>(null);
  const [adaptiveMessage, setAdaptiveMessage] = useState<string>("");
  const [nextAdaptiveStep, setNextAdaptiveStep] = useState<AdaptiveAction | null>(null);
  const [moduleContent, setModuleContent] = useState<ModuleContent | null>(null);
  const [submoduleContent, setSubmoduleContent] = useState<SubmoduleContent | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizScore, setQuizScore] = useState(0);
  const [quizType, setQuizType] = useState<"module" | "baseline" | "final" | "submodule">("module");
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>("student");
  const [preferredDifficulty, setPreferredDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [attempts, setAttempts] = useState(0);
  const [userProgress, setUserProgress] = useState<any>({});
  const [submoduleProgress, setSubmoduleProgress] = useState<any>({});
  const [allRolePlacements, setAllRolePlacements] = useState<Record<string, any>>({});
  const [lastQState, setLastQState] = useState<any>(null);
  const [lastQAction, setLastQAction] = useState<any>(null);

  // Advanced Adaptive Features
  const [baselineLevel, setBaselineLevel] = useState<"Expert" | "Intermediate" | "Beginner">("Expert");
  const [unlockedLevels, setUnlockedLevels] = useState<string[]>(["Beginner"]);
  const [completedLevels, setCompletedLevels] = useState<string[]>([]);
  const [entryLevel, setEntryLevel] = useState<string | null>(null);
  const [skillScores, setSkillScores] = useState<Record<string, number>>({ Theory: 0, "Practical Coding": 0, "Problem Solving": 0 });
  const [confidence, setConfidence] = useState(0.5);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<string[]>([]);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [shiftingInfo, setShiftingInfo] = useState<{ from: string, to: string, score: number, required: number, type: 'up' | 'down' } | null>(null);
  const [showLevelCompletionAssessment, setShowLevelCompletionAssessment] = useState(false);

  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    const initializeCourses = async (currentUser: FirebaseUser | null) => {
      try {
        const coursesSnap = await getDocs(collection(db, "courses"));
        if (coursesSnap.empty) {
          // Only attempt to initialize if the user is the admin (hardcoded email)
          if (currentUser?.email === "balajis.btech22@rvu.edu.in") {
            const batch = writeBatch(db);
            COURSES.forEach(course => {
              const ref = doc(db, "courses", course.id);
              batch.set(ref, course);
            });
            await batch.commit();
            setCourses(COURSES);
          } else {
            // Fallback to local constants if not admin and DB is empty
            setCourses(COURSES);
          }
        } else {
          const fetchedCourses = coursesSnap.docs.map(doc => doc.data() as Course);
          setCourses(fetchedCourses);
        }
      } catch (error) {
        console.error("Error initializing courses:", error);
        setCourses(COURSES); // Fallback to local constants on error
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      initializeCourses(u); // Initialize courses after auth state is known
      if (u) {
        // Fetch user progress
        try {
          const userDoc = await getDoc(doc(db, "users", u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setStreak(data.streak || 0);
            setBadges(data.badges || []);
            setSkillScores(data.skillScores || { Theory: 0, "Practical Coding": 0, "Problem Solving": 0 });
            setUnlockedLevels(data.unlockedLevels || ["Beginner"]);
            setCompletedLevels(data.completedLevels || []);
            setEntryLevel(data.entryLevel || null);
            setAllRolePlacements(data.rolePlacements || {});
            setSelfRatedLevel(data.selfRatedLevel || null);
            setPreferredDifficulty(data.preferredDifficulty || "intermediate");
            if (data.currentCourseId) {
              const course = courses.find(c => c.id === data.currentCourseId) || COURSES.find(c => c.id === data.currentCourseId);
              if (course) {
                setCurrentCourse(course);
                setSelectedRole(course.role);
              }
            }
          } else {
            // Create user doc
            await setDoc(doc(db, "users", u.uid), {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              difficultyLevel: "student",
              unlockedLevels: ["Beginner"],
              completedLevels: [],
              selfRatedLevel: null,
              learningState: { consecutiveSuccesses: 0, consecutiveFailures: 0, totalAttempts: 0 }
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        }

        // Real-time progress listener
        const progressRef = collection(db, "users", u.uid, "progress");
        onSnapshot(progressRef, (snapshot) => {
          const progress: any = {};
          snapshot.docs.forEach(doc => {
            progress[doc.id] = doc.data();
          });
          setUserProgress(progress);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${u.uid}/progress`);
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && currentModule) {
      const subRef = collection(db, "users", user.uid, "progress", currentModule.id, "submodules");
      const unsubscribe = onSnapshot(subRef, (snapshot) => {
        const progress: any = {};
        snapshot.docs.forEach(doc => {
          progress[doc.id] = doc.data();
        });
        setSubmoduleProgress(prev => ({
          ...prev,
          [currentModule.id]: progress
        }));
      });
      return () => unsubscribe();
    }
  }, [user, currentModule]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (authMode === "signup") {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        // Create user doc
        await setDoc(doc(db, "users", userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: displayName,
          difficultyLevel: "student",
          preferredDifficulty: "intermediate",
          unlockedLevels: ["Beginner"],
          completedLevels: [],
          selfRatedLevel: null,
          learningState: { consecutiveSuccesses: 0, consecutiveFailures: 0, totalAttempts: 0 }
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setView("selection");
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setView("selection");
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentCourse(null);
    setSelectedRole(null);
    setView("auth");
  };

  const goToProfile = () => setView("profile");

  const handlePreferredDifficultyChange = async (difficulty: "beginner" | "intermediate" | "advanced") => {
    if (!user) return;
    setPreferredDifficulty(difficulty);
    
    // Map preferred difficulty to explanation level
    const levelMap: Record<string, ExplanationLevel> = {
      beginner: "child",
      intermediate: "student",
      advanced: "expert"
    };
    setExplanationLevel(levelMap[difficulty]);

    try {
      await updateDoc(doc(db, "users", user.uid), {
        preferredDifficulty: difficulty,
        difficultyLevel: levelMap[difficulty]
      });
    } catch (error) {
      console.error("Error saving preferred difficulty:", error);
    }
  };

  const selectRole = (role: string) => {
    setSelectedRole(role);
    
    // Check if user already has an entry level for this role
    const placement = allRolePlacements[role];
    if (placement) {
      setEntryLevel(placement.entryLevel);
      setUnlockedLevels(placement.unlockedLevels);
      setCompletedLevels(placement.completedLevels);
      setExplanationLevel(placement.difficultyLevel);
      
      // Find the course matching their current unlocked level
      const highestUnlocked = placement.unlockedLevels.includes("Expert") ? "Expert" : 
                             (placement.unlockedLevels.includes("Intermediate") ? "Intermediate" : "Beginner");
      const course = COURSES.find(c => c.role === role && c.difficulty === highestUnlocked);
      if (course) {
        selectCourse(course);
        return;
      }
    } else {
      // Reset for new role
      setEntryLevel(null);
      setUnlockedLevels(["Beginner"]);
      setCompletedLevels([]);
    }

    // Default to Beginner if no entry level or course not found
    const course = COURSES.find(c => c.role === role && c.difficulty === "Beginner");
    if (course) {
      selectCourse(course);
    } else {
      setView("selection");
    }
  };

  const selectCourse = async (course: Course) => {
    setIsSelecting(true);
    setCurrentCourse(course);
    if (user) {
      try {
        // Check if baseline quiz is done for this role/course
        // If entryLevel exists for THIS role, they've already been placed
        const placement = allRolePlacements[course.role];
        if (placement?.entryLevel) {
          setView("roadmap");
          setIsSelecting(false);
        } else {
          const baselineRef = doc(db, "users", user.uid, "baseline", course.id);
          const baselineSnap = await getDoc(baselineRef);
          
          if (!baselineSnap.exists()) {
            setView("self_rate"); // Ask for self-rating first
            setIsSelecting(false);
          } else {
            setView("roadmap");
            setIsSelecting(false);
          }
        }

        // Update current course in background
        updateDoc(doc(db, "users", user.uid), { currentCourseId: course.id })
          .catch(error => {
            try {
              handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
            } catch (e) {
              // Error already logged and thrown, but we don't want to crash the app
            }
          });
      } catch (error) {
        setView("roadmap");
        setIsSelecting(false);
        try {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}/baseline/${course.id}`);
        } catch (e) {
          // Error already logged and thrown
        }
      }
    } else {
      setView("roadmap");
      setIsSelecting(false);
    }
  };

  const startBaselineQuiz = async (level: string, course: Course) => {
    if (!user) return;
    setView("baseline");
    setQuizType("baseline");
    setQuizQuestions([]);
    setIsSelecting(false);
    
    // Generate baseline quiz for the specific level
    const allModules = COURSES.filter(c => c.role === course.role)
      .flatMap(c => c.modules)
      .sort((a, b) => a.order - b.order);
    
    const quizId = `baseline_${course.role}_${level}`;
    const quizRef = doc(db, "content", quizId);
    
    try {
      const quizSnap = await getDoc(quizRef);
      if (quizSnap.exists()) {
        setQuizQuestions(quizSnap.data().questions);
      } else {
        const questions = await generateBaselineQuiz(course.title, course.role, level, allModules);
        setQuizQuestions(questions);
        await setDoc(quizRef, {
          questions,
          type: "baseline",
          role: course.role,
          level,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Error loading baseline quiz:", error);
      const questions = await generateBaselineQuiz(course.title, course.role, level, allModules);
      setQuizQuestions(questions);
    }
  };

  const startFinalQuiz = async () => {
    if (!currentCourse || !user) return;
    setView("final");
    setQuizType("final");
    setQuizQuestions([]);

    const quizId = `final_${currentCourse.id}`;
    const quizRef = doc(db, "content", quizId);

    try {
      const quizSnap = await getDoc(quizRef);
      if (quizSnap.exists()) {
        setQuizQuestions(quizSnap.data().questions);
      } else {
        const questions = await generateFinalQuiz(currentCourse.title, currentCourse.modules.map(m => m.title));
        setQuizQuestions(questions);
        await setDoc(quizRef, {
          questions,
          type: "final",
          courseId: currentCourse.id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Error loading final quiz:", error);
      const questions = await generateFinalQuiz(currentCourse.title, currentCourse.modules.map(m => m.title));
      setQuizQuestions(questions);
    }
  };

  const startModule = async (module: Module, level: ExplanationLevel = "student") => {
    setCurrentModule(module);
    setQuizType("module");
    
    setExplanationLevel(level);
    setView("content");
    setModuleContent(null);
    setSubmoduleContent(null);
    setCurrentSubmodule(null);

    // Try to load from cache
    const contentId = `${module.id}_${level}`;
    const contentRef = doc(db, "content", contentId);
    
    try {
      const contentSnap = await getDoc(contentRef);
      if (contentSnap.exists()) {
        setModuleContent(contentSnap.data() as ModuleContent);
      } else {
        const content = await generateModuleContent(module.title, level);
        setModuleContent(content);
        await setDoc(contentRef, {
          ...content,
          moduleId: module.id,
          level: level,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Error loading module content:", error);
      const content = await generateModuleContent(module.title, level);
      setModuleContent(content);
    }
  };

  const startSubmodule = async (submodule: Submodule) => {
    if (!currentModule || !user) return;
    setCurrentSubmodule(submodule);
    setView("submodule_content");
    setSubmoduleContent(null);

    // Get current attempt number for this submodule
    let attempt = 1;
    const submoduleRef = doc(db, "users", user.uid, "progress", currentModule.id, "submodules", submodule.id);
    try {
      const subSnap = await getDoc(submoduleRef);
      if (subSnap.exists()) {
        const data = subSnap.data();
        attempt = (data.attempts || 0) + 1 + (data.remediationCount || 0) * 3;
      }
    } catch (e) {
      console.error("Error fetching submodule attempt:", e);
    }

    const contentId = `${submodule.id}_${explanationLevel}_v${attempt}`;
    const contentRef = doc(db, "content", contentId);

    try {
      const contentSnap = await getDoc(contentRef);
      if (contentSnap.exists()) {
        setSubmoduleContent(contentSnap.data() as SubmoduleContent);
      } else {
        const content = await generateSubmoduleContent(currentModule.title, submodule.title, explanationLevel, attempt);
        setSubmoduleContent(content);
        await setDoc(contentRef, {
          ...content,
          submoduleId: submodule.id,
          moduleId: currentModule.id,
          level: explanationLevel,
          attempt: attempt,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Error loading submodule content:", error);
      const content = await generateSubmoduleContent(currentModule.title, submodule.title, explanationLevel, attempt);
      setSubmoduleContent(content);
    }
  };

  const startQuiz = async () => {
    if (!currentModule || !user) return;
    
    if (currentSubmodule && submoduleContent) {
      setQuizType("submodule");
      setView("quiz");
      setQuizQuestions([]);

      // Get current attempt number
      let attempt = 1;
      const submoduleRef = doc(db, "users", user.uid, "progress", currentModule.id, "submodules", currentSubmodule.id);
      try {
        const subSnap = await getDoc(submoduleRef);
        if (subSnap.exists()) {
          const data = subSnap.data();
          attempt = (data.attempts || 0) + 1 + (data.remediationCount || 0) * 3;
        }
      } catch (e) {
        console.error("Error fetching submodule attempt for quiz:", e);
      }

      const quizId = `${currentSubmodule.id}_${explanationLevel}_v${attempt}_quiz`;
      const quizRef = doc(db, "content", quizId);

      try {
        const quizSnap = await getDoc(quizRef);
        if (quizSnap.exists()) {
          setQuizQuestions(quizSnap.data().questions);
        } else {
          const questions = await generateSubmoduleQuiz(currentSubmodule.title, submoduleContent.explanation, explanationLevel, attempt);
          setQuizQuestions(questions);
          await setDoc(quizRef, {
            questions,
            submoduleId: currentSubmodule.id,
            level: explanationLevel,
            attempt,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("Error loading submodule quiz:", error);
        const questions = await generateSubmoduleQuiz(currentSubmodule.title, submoduleContent.explanation, explanationLevel, attempt);
        setQuizQuestions(questions);
      }
      return;
    }

    if (moduleContent) {
      setQuizType("module");
      setView("quiz");
      setQuizQuestions([]);

      const quizId = `${currentModule.id}_${explanationLevel}_quiz`;
      const quizRef = doc(db, "content", quizId);

      try {
        const quizSnap = await getDoc(quizRef);
        if (quizSnap.exists()) {
          setQuizQuestions(quizSnap.data().questions);
        } else {
          const questions = await generateQuiz(currentModule.title, explanationLevel, moduleContent.explanation);
          setQuizQuestions(questions);
          await setDoc(quizRef, {
            questions,
            moduleId: currentModule.id,
            level: explanationLevel,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("Error loading module quiz:", error);
        const questions = await generateQuiz(currentModule.title, explanationLevel, moduleContent.explanation);
        setQuizQuestions(questions);
      }
    }
  };

  const handleSelfRate = async (level: "Expert" | "Intermediate" | "Beginner") => {
    if (!user || !currentCourse) return;
    setSelfRatedLevel(level);
    setBaselineLevel(level);
    
    try {
      await updateDoc(doc(db, "users", user.uid), {
        selfRatedLevel: level
      });
    } catch (error) {
      console.error("Error saving self-rating:", error);
    }
    
    startBaselineQuiz(level, currentCourse);
  };

  const handleQuizSubmit = async (score: number, mistakes: string[], categoryResults: Record<string, { correct: number, total: number }>) => {
    if (!user || !currentCourse) return;
    setQuizScore(score);
    
    // Calculate skill scores
    const newSkillScores = { ...skillScores };
    Object.entries(categoryResults).forEach(([cat, result]) => {
      const catScore = result.correct / result.total;
      // Weighted average with existing score
      newSkillScores[cat] = (newSkillScores[cat] * 0.7) + (catScore * 0.3);
    });
    setSkillScores(newSkillScores);

    if (view === "baseline") {
      const thresholds = { Expert: 0.55, Intermediate: 0.70, Beginner: 0.80 };
      const currentThreshold = thresholds[baselineLevel as keyof typeof thresholds] || 0.8;
      const passed = score >= currentThreshold;

      if (passed) {
        // Check if we should shift UP (if they did exceptionally well and aren't at Expert yet)
        if (score >= 0.9) {
          if (baselineLevel === "Beginner") {
            setShiftingInfo({ from: "Beginner", to: "Intermediate", score, required: 0.9, type: 'up' });
            setBaselineLevel("Intermediate");
            setView("shifting");
            return;
          } else if (baselineLevel === "Intermediate") {
            setShiftingInfo({ from: "Intermediate", to: "Expert", score, required: 0.9, type: 'up' });
            setBaselineLevel("Expert");
            setView("shifting");
            return;
          }
        }

        let finalUnlocked = ["Beginner"];
        let finalCompleted: string[] = [];
        let finalEntry = "Beginner";
        let finalExpl = "child";

        if (baselineLevel === "Expert") {
          finalEntry = "Expert";
          finalUnlocked = ["Beginner", "Intermediate", "Expert"];
          finalCompleted = ["Beginner", "Intermediate"];
          finalExpl = "expert";
        } else if (baselineLevel === "Intermediate") {
          finalEntry = "Intermediate";
          finalUnlocked = ["Beginner", "Intermediate"];
          finalCompleted = ["Beginner"];
          finalExpl = "student";
        } else {
          finalEntry = "Beginner";
          finalUnlocked = ["Beginner"];
          finalCompleted = [];
          finalExpl = "student";
        }

        setEntryLevel(finalEntry);
        setUnlockedLevels(finalUnlocked);
        setCompletedLevels(finalCompleted);
        setExplanationLevel(finalExpl as ExplanationLevel);

        try {
          const placement = {
            entryLevel: finalEntry,
            unlockedLevels: finalUnlocked,
            completedLevels: finalCompleted,
            difficultyLevel: finalExpl,
            timestamp: new Date().toISOString()
          };
          
          await updateDoc(doc(db, "users", user.uid), {
            [`rolePlacements.${selectedRole}`]: placement,
            // Also update global for backward compatibility or current view
            entryLevel: finalEntry,
            unlockedLevels: finalUnlocked,
            completedLevels: finalCompleted,
            difficultyLevel: finalExpl
          });
          
          setAllRolePlacements(prev => ({
            ...prev,
            [selectedRole!]: placement
          }));
        } catch (error) {
          console.error("Error updating user placement:", error);
        }

        setView("result");
      } else {
        if (baselineLevel === "Expert") {
          setShiftingInfo({ from: "Expert", to: "Intermediate", score, required: currentThreshold, type: 'down' });
          setBaselineLevel("Intermediate");
          setView("shifting");
        } else if (baselineLevel === "Intermediate") {
          setShiftingInfo({ from: "Intermediate", to: "Beginner", score, required: currentThreshold, type: 'down' });
          setBaselineLevel("Beginner");
          setView("shifting");
        } else if (baselineLevel === "Beginner") {
          // Failed Beginner baseline too - still start at Beginner
          setEntryLevel("Beginner");
          setUnlockedLevels(["Beginner"]);
          setCompletedLevels([]);
          setExplanationLevel("child");
          setWeakAreas(mistakes);

          try {
            const placement = {
              entryLevel: "Beginner",
              unlockedLevels: ["Beginner"],
              completedLevels: [],
              difficultyLevel: "child",
              timestamp: new Date().toISOString()
            };
            
            await updateDoc(doc(db, "users", user.uid), {
              [`rolePlacements.${selectedRole}`]: placement,
              entryLevel: "Beginner",
              unlockedLevels: ["Beginner"],
              completedLevels: [],
              difficultyLevel: "child"
            });
            
            setAllRolePlacements(prev => ({
              ...prev,
              [selectedRole!]: placement
            }));
          } catch (error) {
            console.error("Error updating user placement (failed beginner):", error);
          }

          setView("result");
        }
      }
      return;
    }

    if (view === "final") {
      const passThreshold = 0.8;
      const passed = score >= passThreshold;
      
      if (passed) {
        // Unlock next level
        const levels = ["Beginner", "Intermediate", "Expert"];
        const currentIndex = levels.indexOf(currentCourse.difficulty);
        let nextUnlocked = [...unlockedLevels];
        let nextCompleted = [...completedLevels];

        if (currentIndex < levels.length - 1) {
          const nextLevel = levels[currentIndex + 1];
          nextUnlocked = [...new Set([...nextUnlocked, nextLevel])];
          nextCompleted = [...new Set([...nextCompleted, currentCourse.difficulty])];
        } else {
          nextCompleted = [...new Set([...nextCompleted, "Expert"])];
        }

        setUnlockedLevels(nextUnlocked);
        setCompletedLevels(nextCompleted);

        try {
          await updateDoc(doc(db, "users", user.uid), {
            unlockedLevels: nextUnlocked,
            completedLevels: nextCompleted
          });
        } catch (error) {
          console.error("Error updating user progression:", error);
        }
      }

      try {
        await setDoc(doc(db, "users", user.uid, "final", currentCourse.id), {
          score,
          passed,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error saving final quiz:", error);
      }
      setView("result");
      return;
    }

    if (!currentModule) return;
    setView("result");

    const passThreshold = 0.8;
    const passed = score >= passThreshold;

    if (quizType === "submodule" && currentSubmodule) {
      const submoduleRef = doc(db, "users", user.uid, "progress", currentModule.id, "submodules", currentSubmodule.id);
      
      // Get current submodule progress to track attempts
      let currentSubAttempts = 0;
      try {
        const subSnap = await getDoc(submoduleRef);
        if (subSnap.exists()) {
          currentSubAttempts = subSnap.data().attempts || 0;
        }
      } catch (e) {
        console.error("Error fetching submodule progress:", e);
      }
      
      const newSubAttempts = currentSubAttempts + 1;
      setAttempts(newSubAttempts);

      try {
        await setDoc(submoduleRef, {
          userId: user.uid,
          submoduleId: currentSubmodule.id,
          moduleId: currentModule.id,
          courseId: currentCourse.id,
          completed: passed,
          quizScore: score,
          attempts: newSubAttempts,
          timestamp: new Date().toISOString()
        });

        // Update module progress with completed submodule - Use setDoc with merge to ensure doc exists
        await setDoc(doc(db, "users", user.uid, "progress", currentModule.id), {
          completedSubmodules: arrayUnion(currentSubmodule.id),
          userId: user.uid,
          moduleId: currentModule.id,
          courseId: currentCourse.id,
          timestamp: new Date().toISOString()
        }, { merge: true });

        // Adaptive Logic (Q-Learning Powered)
        try {
          const subIndex = currentModule.submodules.findIndex(s => s.id === currentSubmodule.id);
          const subOrder = currentModule.order * 10 + (subIndex + 1);
          
          // 1. Update Q-Table
          if (lastQState && lastQAction) {
            const nextState = getQState(subOrder, explanationLevel, newSubAttempts, score);
            await updateQTable(user.uid, lastQState, lastQAction, score, nextState);
          }

          // 2. Predict NEXT step
          const nextStep = await predictNextStepQLearning(
            user.uid,
            currentCourse,
            { ...currentModule, order: subOrder } as any, // Use subOrder for state
            explanationLevel,
            score,
            newSubAttempts,
            true // isSubmodule
          );

          // 3. Store state/action
          setLastQState(getQState(subOrder, explanationLevel, newSubAttempts, score));
          setLastQAction({
            type: nextStep.action,
            targetLevel: levelToNumber(nextStep.nextLevel),
            moduleOffset: nextStep.action === "next" ? 1 : (nextStep.action === "previous" ? -1 : 0)
          });

          setAdaptiveMessage(nextStep.message);
          setNextAdaptiveStep(nextStep);

          if (nextStep.action === "change_level") {
            setExplanationLevel(nextStep.nextLevel);
          }

          // Reset attempts if moving away or changing level significantly
          if (nextStep.action !== "revisit" && !passed) {
            await updateDoc(submoduleRef, { 
              attempts: 0,
              remediationCount: increment(1)
            });
          }
        } catch (error) {
          console.error("Submodule Q-Learning failed:", error);
          // Fallback to basic message
          setAdaptiveMessage(passed ? "Great job! You've mastered this submodule." : "Review the content and try again.");
          setNextAdaptiveStep({
            action: passed ? "next" : "revisit",
            nextModuleId: currentModule.id,
            nextLevel: explanationLevel,
            message: passed ? "Moving forward" : "Try again"
          });
        }
      } catch (error) {
        console.error("Error saving submodule progress:", error);
      }
      return;
    }

    // Update progress in Firestore for Module
    const progressRef = doc(db, "users", user.uid, "progress", currentModule.id);
    const currentProgress = userProgress[currentModule.id] || { attempts: 0 };
    const newAttempts = currentProgress.attempts + 1;
    setAttempts(newAttempts);
    
    try {
      await setDoc(progressRef, {
        userId: user.uid,
        moduleId: currentModule.id,
        courseId: currentCourse.id,
        attempts: newAttempts,
        passed: passed,
        lastQuizScore: score,
        explanationLevel: explanationLevel,
        mistakes: mistakes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/progress/${currentModule.id}`);
    }

    // Adaptive Logic (Q-Learning Powered)
    if (user && currentCourse && currentModule) {
      try {
        // 1. Update Q-Table based on the result of the action that led to this quiz
        if (lastQState && lastQAction) {
          const nextState = getQState(currentModule.order, explanationLevel, newAttempts, score);
          await updateQTable(user.uid, lastQState, lastQAction, score, nextState);
        }

        // 2. Predict NEXT step using Q-Learning
        const nextStep = await predictNextStepQLearning(
          user.uid,
          currentCourse,
          currentModule,
          explanationLevel,
          score,
          newAttempts
        );

        // 3. Store the state and action for the next update cycle
        setLastQState(getQState(currentModule.order, explanationLevel, newAttempts, score));
        setLastQAction({
          type: nextStep.action,
          targetLevel: levelToNumber(nextStep.nextLevel),
          moduleOffset: nextStep.action === "next" ? 1 : (nextStep.action === "previous" ? -1 : 0)
        });

        setAdaptiveMessage(nextStep.message);
        setNextAdaptiveStep(nextStep);
        
        // Auto-apply some adaptive changes if needed
        if (nextStep.action === "change_level") {
          setExplanationLevel(nextStep.nextLevel);
        }
      } catch (error) {
        console.error("Q-Learning Prediction failed, falling back to rule-based logic:", error);
        const state: AdaptiveState = {
          attempts: newAttempts,
          lastScore: score,
          currentModuleId: currentModule.id,
          currentLevel: explanationLevel
        };
        const nextStep = getNextStep(currentCourse, state);
        setAdaptiveMessage(nextStep.message);
        setNextAdaptiveStep(nextStep);
        if (nextStep.action === "change_level") {
          setExplanationLevel(nextStep.nextLevel);
        }
      }
    }
  };

  const finalizePlacement = async (userConfidence: number) => {
    if (!user || !currentCourse) return;
    setConfidence(userConfidence);
    
    // Weighted Decision Model: 70% Quiz Score, 30% Confidence
    const weightedScore = (quizScore * 0.7) + (userConfidence * 0.3);
    
    let finalLevel: ExplanationLevel = "student";
    let skipBeginner = false;
    let skipIntermediate = false;

    if (baselineLevel === "Expert") {
      finalLevel = "expert";
      skipBeginner = true;
      skipIntermediate = true;
    } else if (baselineLevel === "Intermediate") {
      finalLevel = "student";
      skipBeginner = true;
    } else {
      finalLevel = "child";
    }

    setExplanationLevel(finalLevel);

    // Mark skipped modules
    const batch = writeBatch(db);
    const modulesToSkip = COURSES.filter(c => c.role === currentCourse.role)
      .filter(c => {
        if (skipIntermediate) return c.difficulty === "Beginner" || c.difficulty === "Intermediate";
        if (skipBeginner) return c.difficulty === "Beginner";
        return false;
      })
      .flatMap(c => c.modules);

    modulesToSkip.forEach(m => {
      const ref = doc(db, "users", user.uid, "progress", m.id);
      batch.set(ref, {
        userId: user.uid,
        moduleId: m.id,
        courseId: currentCourse.id,
        passed: true,
        lastQuizScore: 1,
        isBaselineSkipped: true,
        timestamp: new Date().toISOString()
      }, { merge: true });
    });

    await batch.commit();

    try {
      await setDoc(doc(db, "users", user.uid, "baseline", currentCourse.id), {
        score: quizScore,
        confidence: userConfidence,
        weightedScore,
        finalLevel,
        baselineLevel,
        timestamp: new Date().toISOString()
      });
      
      // Update user doc with initial level and skill scores
      await updateDoc(doc(db, "users", user.uid), {
        difficultyLevel: finalLevel,
        skillScores,
        badges: arrayUnion("Fast Starter")
      });
    } catch (error) {
      console.error("Error finalizing placement:", error);
    }

    setView("result");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-sm"
        >
          <div className="w-16 h-16 bg-[#5A5A40] rounded-full flex items-center justify-center mx-auto mb-6">
            <GraduationCap className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif mb-2 text-center">Academia AI</h1>
          <p className="text-gray-600 mb-8 text-center">Personalized learning paths powered by Adaptive AI.</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            {authMode === "signup" && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 focus:border-[#5A5A40] outline-none transition-all"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="email" 
                placeholder="Email Address" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 focus:border-[#5A5A40] outline-none transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="password" 
                placeholder="Password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 focus:border-[#5A5A40] outline-none transition-all"
              />
            </div>
            {authError && <p className="text-xs text-red-500 mt-2">{authError}</p>}
            <button 
              type="submit"
              className="w-full bg-[#5A5A40] text-white py-3 rounded-full font-medium hover:opacity-90 transition-opacity"
            >
              {authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">Or continue with</span></div>
          </div>

          <button 
            onClick={handleLogin}
            className="w-full border border-gray-200 text-gray-600 py-3 rounded-full font-medium hover:bg-gray-50 transition-all flex items-center justify-center gap-2 mb-6"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Google Login
          </button>

          <p className="text-sm text-gray-500 text-center">
            {authMode === "login" ? "Don't have an account?" : "Already have an account?"}
            <button 
              onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
              className="ml-1 text-[#5A5A40] font-bold hover:underline"
            >
              {authMode === "login" ? "Sign Up" : "Log In"}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  const roles: string[] = Array.from(new Set(courses.map(c => c.role)));

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView("selection")}>
          <GraduationCap className="text-[#5A5A40] w-6 h-6" />
          <span className="font-serif text-xl font-bold">Academia AI</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={goToProfile}
            className={`p-2 rounded-full transition-colors ${view === 'profile' ? 'bg-[#5A5A40] text-white' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <User className="w-5 h-5" />
          </button>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user.displayName || user.email?.split('@')[0]}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <LogOut className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === "profile" && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex items-center gap-4 mb-8">
                <button onClick={() => setView("selection")} className="p-2 hover:bg-gray-200 rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-3xl font-serif">Your Profile</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                  <div className="bg-white p-8 rounded-[32px] border border-gray-100 text-center">
                    <div className="w-24 h-24 bg-[#5A5A40] rounded-full flex items-center justify-center mx-auto mb-4 text-white text-3xl font-serif">
                      {user.displayName?.[0] || user.email?.[0].toUpperCase()}
                    </div>
                    <h3 className="text-xl font-medium">{user.displayName || "Learner"}</h3>
                    <p className="text-sm text-gray-500 mb-6">{user.email}</p>
                    <div className="flex justify-center gap-2">
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase">
                        {explanationLevel} Level
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-[32px] border border-gray-100">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Skill Mastery</h4>
                    <div className="space-y-4">
                      {Object.entries(skillScores).map(([skill, score]) => (
                        <div key={skill} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{skill}</span>
                            <span>{Math.round(score * 100)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#5A5A40]" style={{ width: `${score * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-[32px] border border-gray-100">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Achievements</h4>
                    <div className="flex flex-wrap gap-2">
                      {badges.length > 0 ? badges.map(badge => (
                        <div key={badge} className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-[10px] font-bold border border-yellow-100">
                          {badge}
                        </div>
                      )) : <p className="text-xs text-gray-400">No badges yet.</p>}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white p-8 rounded-[32px] border border-gray-100">
                    <h4 className="text-xl font-serif mb-6 flex items-center gap-2">
                      <BarChart className="w-6 h-6 text-[#5A5A40]" />
                      Learning Progress
                    </h4>
                    {Object.keys(userProgress).length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>No progress data yet. Start a course to see your stats!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(userProgress).map(([moduleId, data]: [string, any]) => {
                          const module = courses.flatMap(c => c.modules).find(m => m.id === moduleId);
                          if (!module) return null;
                          return (
                            <div key={moduleId} className="p-4 rounded-2xl border border-gray-50 bg-gray-50/50 flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{module.title}</p>
                                <p className="text-xs text-gray-500">Last Score: {Math.round((data.lastQuizScore || 0) * 100)}% • {data.attempts} attempts</p>
                              </div>
                              {data.passed ? (
                                <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-bold uppercase">Mastered</span>
                              ) : (
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full text-[10px] font-bold uppercase">In Progress</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-8 rounded-[32px] border border-gray-100">
                    <h4 className="text-xl font-serif mb-6 flex items-center gap-2">
                      <Settings className="w-6 h-6 text-[#5A5A40]" />
                      Preferences
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-2xl border border-gray-50">
                        <div>
                          <p className="font-medium text-sm">Preferred Difficulty</p>
                          <p className="text-xs text-gray-500">Manual AI challenge setting</p>
                        </div>
                        <select 
                          value={preferredDifficulty}
                          onChange={(e) => handlePreferredDifficultyChange(e.target.value as any)}
                          className="bg-gray-100 border-none rounded-lg text-sm px-3 py-2 outline-none"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl border border-gray-50">
                        <div>
                          <p className="font-medium text-sm">Explanation Level</p>
                          <p className="text-xs text-gray-500">Current AI adaptation level</p>
                        </div>
                        <select 
                          value={explanationLevel}
                          onChange={(e) => setExplanationLevel(e.target.value as ExplanationLevel)}
                          className="bg-gray-100 border-none rounded-lg text-sm px-3 py-2 outline-none"
                        >
                          <option value="child">Child (Simple)</option>
                          <option value="student">Student (Standard)</option>
                          <option value="expert">Expert (Technical)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === "selection" && (
            <motion.div 
              key="selection"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <h2 className="text-4xl font-serif mb-8">Choose Your Career Path</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {roles.map((role) => (
                  <div 
                    key={role}
                    onClick={() => selectRole(role)}
                    className="bg-white p-8 rounded-[32px] border border-gray-200 hover:border-[#5A5A40] cursor-pointer transition-all group"
                  >
                    <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#5A5A40] transition-colors">
                      <Target className="w-6 h-6 text-gray-600 group-hover:text-white" />
                    </div>
                    <h3 className="text-2xl font-serif mb-2">{role}</h3>
                    <p className="text-sm text-gray-500 mb-6">Master the skills needed for {role} roles.</p>
                    <div className="flex items-center text-[#5A5A40] font-medium text-sm">
                      Start Diagnostic <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === "roadmap" && currentCourse && (
            <motion.div 
              key="roadmap"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <button onClick={() => setView("selection")} className="flex items-center text-gray-500 mb-6 hover:text-black">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Career Paths
              </button>
              
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-serif mb-2">{selectedRole} Journey</h2>
                  <p className="text-gray-600">Strict Sequential Mastery Path</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-xs font-bold">
                    <Zap className="w-3 h-3 fill-current" />
                    {streak} Day Streak
                  </div>
                </div>
              </div>

              {/* 3-Node Roadmap UI */}
              <div className="relative mb-16 px-4">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -translate-y-1/2 z-0" />
                <div className="relative z-10 flex justify-between items-center max-w-2xl mx-auto">
                  {["Beginner", "Intermediate", "Expert"].map((level, idx) => {
                    const isCompleted = completedLevels.includes(level);
                    const isUnlocked = unlockedLevels.includes(level);
                    
                    // Strict Gating: Expert is locked until all Intermediate modules are passed
                    let isLocked = !isUnlocked && !isCompleted;
                    if (level === "Expert") {
                      const intermediateCourse = COURSES.find(c => c.role === selectedRole && c.difficulty === "Intermediate");
                      const allIntermediatePassed = intermediateCourse?.modules.every(m => userProgress[m.id]?.passed);
                      const isIntermediateCompleted = completedLevels.includes("Intermediate");
                      if (!allIntermediatePassed && !isIntermediateCompleted) isLocked = true;
                    }
                    
                    // If the level itself is marked as completed or unlocked, it shouldn't be locked by the gating logic
                    if (isCompleted || isUnlocked) isLocked = false;
                    
                    return (
                      <div key={level} className="flex flex-col items-center gap-4">
                        <motion.button
                          whileHover={!isLocked ? { scale: 1.1 } : {}}
                          whileTap={!isLocked ? { scale: 0.9 } : {}}
                          onClick={() => {
                            if (!isLocked) {
                              const course = COURSES.find(c => c.role === selectedRole && c.difficulty === level);
                              if (course) setCurrentCourse(course);
                            }
                          }}
                          className={`w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all ${
                            isCompleted ? 'bg-green-500 border-green-200 text-white' :
                            !isLocked ? 'bg-white border-[#5A5A40] text-[#5A5A40] shadow-lg' :
                            'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {isCompleted ? <CheckCircle className="w-8 h-8" /> : 
                           isLocked ? <Lock className="w-6 h-6" /> : 
                           <span className="text-xl font-bold">{idx + 1}</span>}
                        </motion.button>
                        <span className={`text-sm font-bold uppercase tracking-wider ${
                          !isLocked ? 'text-[#5A5A40]' : 'text-gray-400'
                        }`}>
                          {level}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[32px] border border-gray-100 mb-12 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-serif">{currentCourse.difficulty} Modules</h3>
                  <div className="text-sm font-medium text-gray-500">
                    {currentCourse.modules.filter(m => userProgress[m.id]?.passed).length} / {currentCourse.modules.length} Completed
                  </div>
                </div>
                
                <div className="space-y-4">
                  {currentCourse.modules.map((module, idx) => {
                    const progress = userProgress[module.id];
                    const prevModule = idx > 0 ? currentCourse.modules[idx-1] : null;
                    
                    // Unlock if previous module passed OR if the entire level is marked as completed (e.g. skipped via baseline)
                    const isLevelCompleted = completedLevels.includes(currentCourse.difficulty);
                    const isModuleLocked = !isLevelCompleted && prevModule && !userProgress[prevModule.id]?.passed && !progress?.passed;
                    
                    return (
                      <div 
                        key={module.id}
                        className={`flex items-center gap-6 p-6 rounded-[24px] border transition-all ${
                          isModuleLocked ? 'bg-gray-50 border-gray-100 opacity-75' : 
                          progress?.passed ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          progress?.passed ? 'bg-green-500 text-white' : isModuleLocked ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {progress?.passed ? <CheckCircle className="w-5 h-5" /> : isModuleLocked ? <Lock className="w-4 h-4" /> : <span className="font-bold text-sm">{idx + 1}</span>}
                        </div>
                        <div className="flex-1">
                          <h4 className={`font-medium ${isModuleLocked ? 'text-gray-400' : 'text-black'}`}>{module.title}</h4>
                          {!isModuleLocked && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-[#5A5A40] transition-all duration-500"
                                  style={{ width: `${((userProgress[module.id]?.completedSubmodules?.length || 0) / 5) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-400 font-bold uppercase">
                                {userProgress[module.id]?.completedSubmodules?.length || 0}/5 Submodules
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => startModule(module)}
                            disabled={isModuleLocked}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              isModuleLocked ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            Learn
                          </button>
                          <button 
                            onClick={() => {
                              setCurrentModule(module);
                              setModuleContent(null);
                              startQuiz();
                            }}
                            disabled={isModuleLocked}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                              isModuleLocked ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 
                              progress?.passed ? 'bg-green-50 text-green-600' : 'bg-[#5A5A40] text-white'
                            }`}
                          >
                            {progress?.passed ? "Retake" : "Quiz"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Level Completion Assessment */}
                {currentCourse.modules.every(m => userProgress[m.id]?.passed) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 p-8 bg-[#5A5A40] rounded-[32px] text-white text-center"
                  >
                    <Trophy className="w-12 h-12 mx-auto mb-4" />
                    <h3 className="text-2xl font-serif mb-2">Level Mastery Achieved!</h3>
                    <p className="text-white/80 mb-6">Pass the Level Completion Assessment to unlock the next stage of your journey.</p>
                    <button 
                      onClick={startFinalQuiz}
                      className="bg-white text-[#5A5A40] px-8 py-3 rounded-full font-bold hover:bg-gray-100 transition-all"
                    >
                      Start Level Assessment
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {view === "content" && currentModule && (
            <motion.div 
              key="content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-3xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <button onClick={() => setView("roadmap")} className="flex items-center text-gray-500 hover:text-black">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Roadmap
                </button>
                <div className="flex gap-2">
                  {(["child", "student", "expert"] as ExplanationLevel[]).map((l) => (
                    <button 
                      key={l}
                      onClick={() => startModule(currentModule, l)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                        explanationLevel === l ? 'bg-[#5A5A40] text-white border-[#5A5A40]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {!moduleContent ? (
                <div className="bg-white p-12 rounded-[32px] text-center">
                  <Brain className="w-12 h-12 text-[#5A5A40] mx-auto mb-4 animate-pulse" />
                  <h3 className="text-xl font-serif">AI is tailoring your module overview...</h3>
                  <p className="text-gray-500">Adjusting level to: {explanationLevel}</p>
                </div>
              ) : (
                <div className="bg-white p-10 rounded-[32px] shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider">
                      {explanationLevel} Level
                    </span>
                  </div>
                  <h2 className="text-3xl font-serif mb-6">{moduleContent.title}</h2>
                  <div className="prose prose-slate max-w-none mb-10 text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {moduleContent.explanation}
                  </div>

                  <div className="space-y-6 mb-12">
                    <h3 className="text-2xl font-serif border-b pb-2">Module Submodules</h3>
                    <p className="text-sm text-gray-500 italic mb-4">Complete all submodules in order to unlock the Module Mastery Quiz.</p>
                    <div className="grid gap-4">
                      {currentModule.submodules.map((sub, idx) => {
                        const moduleProgress = userProgress[currentModule.id] || { completedSubmodules: [] };
                        const isCompleted = moduleProgress.completedSubmodules?.includes(sub.id);
                        
                        // Unlock if previous submodule completed OR if the entire level is marked as completed
                        const isLevelCompleted = completedLevels.includes(currentCourse.difficulty);
                        const isLocked = !isLevelCompleted && idx > 0 && !moduleProgress.completedSubmodules?.includes(currentModule.submodules[idx - 1].id);
                        
                        return (
                          <div 
                            key={sub.id}
                            className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${
                              isLocked ? 'bg-gray-50 border-gray-100 opacity-60' : 
                              isCompleted ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200 hover:border-[#5A5A40]'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                isCompleted ? 'bg-green-500 text-white' : isLocked ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {isCompleted ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                              </div>
                              <div>
                                <h4 className={`font-medium ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>{sub.title}</h4>
                                <div className="flex gap-2 items-center">
                                  {isCompleted && <span className="text-[10px] text-green-600 font-bold uppercase">Mastered</span>}
                                  {submoduleProgress[currentModule.id]?.[sub.id]?.attempts > 0 && (
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">
                                      {submoduleProgress[currentModule.id][sub.id].attempts} Attempts
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => startSubmodule(sub)}
                              disabled={isLocked}
                              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                                isLocked ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                                isCompleted ? 'bg-white text-green-600 border border-green-200 hover:bg-green-50' :
                                'bg-[#5A5A40] text-white hover:opacity-90'
                              }`}
                            >
                              {isCompleted ? "Review" : "Start"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 border-t pt-8">
                    <h3 className="text-xl font-serif mb-2">Module Mastery</h3>
                    <button 
                      onClick={startQuiz}
                      disabled={!completedLevels.includes(currentCourse.difficulty) && !currentModule.submodules.every(sub => userProgress[currentModule.id]?.completedSubmodules?.includes(sub.id))}
                      className={`w-full py-4 rounded-full font-medium transition-all flex items-center justify-center gap-2 ${
                        completedLevels.includes(currentCourse.difficulty) || currentModule.submodules.every(sub => userProgress[currentModule.id]?.completedSubmodules?.includes(sub.id))
                        ? 'bg-[#5A5A40] text-white hover:opacity-90'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Trophy className="w-5 h-5" />
                      Take Module Mastery Quiz
                    </button>
                    {!currentModule.submodules.every(sub => userProgress[currentModule.id]?.completedSubmodules?.includes(sub.id)) && (
                      <p className="text-center text-xs text-gray-400">
                        Complete all 5 submodules to unlock this quiz.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === "submodule_content" && currentSubmodule && (
            <motion.div 
              key="submodule_content"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-3xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <button onClick={() => setView("content")} className="flex items-center text-gray-500 hover:text-black">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Module Overview
                </button>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Submodule {currentSubmodule.order} of 5
                </span>
              </div>

              {!submoduleContent ? (
                <div className="bg-white p-12 rounded-[32px] text-center">
                  <Brain className="w-12 h-12 text-[#5A5A40] mx-auto mb-4 animate-pulse" />
                  <h3 className="text-xl font-serif">AI is crafting your submodule lesson...</h3>
                </div>
              ) : (
                <div className="bg-white p-10 rounded-[32px] shadow-sm border border-gray-100">
                  <h2 className="text-3xl font-serif mb-6">{submoduleContent.title}</h2>
                  
                  <div className="prose prose-slate max-w-none mb-10 text-gray-700 leading-relaxed whitespace-pre-wrap">
                    <Markdown>{submoduleContent.explanation}</Markdown>
                  </div>

                  {submoduleContent.examples && submoduleContent.examples.length > 0 && (
                    <div className="mb-10 space-y-4">
                      <h3 className="text-xl font-serif flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-[#5A5A40]" />
                        Practical Examples
                      </h3>
                      {submoduleContent.examples.map((ex, i) => (
                        <div key={i} className="bg-gray-50 p-6 rounded-2xl border border-gray-100 font-mono text-sm">
                          <Markdown>{ex}</Markdown>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-[#5A5A40]/5 p-8 rounded-[32px] mb-10 border border-[#5A5A40]/10">
                    <h3 className="text-xl font-serif mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-[#5A5A40]" />
                      Practice Exercise
                    </h3>
                    <div className="text-gray-700 text-sm italic">
                      <Markdown>{submoduleContent.practice}</Markdown>
                    </div>
                  </div>

                  {submoduleContent.videos && submoduleContent.videos.length > 0 && (
                    <div className="mb-10">
                      <h3 className="text-xl font-serif mb-6 flex items-center gap-2">
                        <Youtube className="text-red-600 w-6 h-6" />
                        Recommended Video
                      </h3>
                      <div className="grid grid-cols-1 gap-4">
                        {submoduleContent.videos.map((video, vIdx) => (
                          <a 
                            key={vIdx}
                            href={`https://www.youtube.com/watch?v=${video.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-[#5A5A40] transition-all"
                          >
                            <div className="w-24 aspect-video bg-gray-200 relative rounded-lg overflow-hidden shrink-0">
                              <img 
                                src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`} 
                                alt={video.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Play className="w-6 h-6 text-white fill-current" />
                              </div>
                            </div>
                            <h4 className="font-medium text-sm text-gray-800 group-hover:text-[#5A5A40] transition-colors">
                              {video.title}
                            </h4>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={startQuiz}
                    className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Take Submodule Quiz
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {(view === "quiz" || view === "baseline" || view === "final") && (
            <QuizView 
              key={`${view}-${baselineLevel}-${currentModule?.id || 'none'}-${quizQuestions.length}`}
              questions={quizQuestions} 
              onSubmit={handleQuizSubmit} 
              onCancel={() => setView(view === "baseline" ? "difficulty" : "roadmap")}
              title={view === "baseline" ? "Baseline Assessment" : view === "final" ? "Final Comprehensive Exam" : undefined}
            />
          )}

          {view === "shifting" && shiftingInfo && (
            <motion.div 
              key="shifting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto text-center bg-white p-12 rounded-[40px] shadow-sm"
            >
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                shiftingInfo.type === 'up' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
              }`}>
                {shiftingInfo.type === 'up' ? <Trophy className="w-10 h-10" /> : <Zap className="w-10 h-10" />}
              </div>
              <h2 className="text-3xl font-serif mb-4">
                {shiftingInfo.type === 'up' ? "Leveling Up!" : `Shifting to ${shiftingInfo.to}`}
              </h2>
              <p className="text-gray-600 mb-8">
                {shiftingInfo.type === 'up' ? (
                  <>
                    You scored <span className="font-bold text-[#5A5A40]">{Math.round(shiftingInfo.score * 100)}%</span> on the {shiftingInfo.from} assessment.
                    <br />
                    You've exceeded the {shiftingInfo.from} level! Let's try the {shiftingInfo.to} assessment.
                  </>
                ) : (
                  <>
                    Your score on the {shiftingInfo.from} assessment was <span className="font-bold text-[#5A5A40]">{Math.round(shiftingInfo.score * 100)}%</span>.
                    <br />
                    A score of <span className="font-bold text-[#5A5A40]">{Math.round(shiftingInfo.required * 100)}%</span> was required to stay in the {shiftingInfo.from} level.
                  </>
                )}
              </p>
              <button 
                onClick={() => {
                  if (currentCourse) {
                    setShiftingInfo(null);
                    startBaselineQuiz(shiftingInfo.to, currentCourse);
                  }
                }}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                Start {shiftingInfo.to} Assessment
              </button>
            </motion.div>
          )}

          {view === "self_rate" && (
            <motion.div 
              key="self_rate"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto text-center"
            >
              <h2 className="text-4xl font-serif mb-4">How much do you already know?</h2>
              <p className="text-gray-500 mb-12 text-lg">
                Self-rating helps us pick the right starting point for your baseline assessment.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(["Beginner", "Intermediate", "Expert"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => handleSelfRate(lvl)}
                    className="bg-white p-8 rounded-[32px] border-2 border-transparent hover:border-[#5A5A40] transition-all group text-left"
                  >
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#5A5A40] group-hover:text-white transition-colors">
                      {lvl === "Beginner" && <BookOpen className="w-6 h-6" />}
                      {lvl === "Intermediate" && <GraduationCap className="w-6 h-6" />}
                      {lvl === "Expert" && <Trophy className="w-6 h-6" />}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{lvl}</h3>
                    <p className="text-sm text-gray-500">
                      {lvl === "Beginner" && "I'm new to this subject and want to start from the basics."}
                      {lvl === "Intermediate" && "I have some experience and understand the core concepts."}
                      {lvl === "Expert" && "I'm very experienced and want to test my advanced knowledge."}
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {view === "confidence" && (
            <motion.div 
              key="confidence"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto text-center bg-white p-12 rounded-[40px] shadow-sm"
            >
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Brain className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-serif mb-2">Confidence Check</h2>
              <p className="text-gray-600 mb-8">
                How confident do you feel about your performance in this {baselineLevel} assessment?
              </p>
              
              <div className="space-y-6 mb-10">
                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                  <span>Novice</span>
                  <span>Expert</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={confidence}
                  onChange={(e) => setConfidence(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-[#5A5A40]"
                />
                <div className="text-2xl font-serif text-[#5A5A40]">
                  {Math.round(confidence * 100)}% Confidence
                </div>
              </div>

              <button 
                onClick={() => finalizePlacement(confidence)}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                Finalize My Placement
              </button>
            </motion.div>
          )}

          {view === "result" && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-xl mx-auto text-center bg-white p-12 rounded-[40px] shadow-sm"
            >
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                quizScore >= 0.8 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}>
                {quizScore >= 0.8 ? <Trophy className="w-10 h-10" /> : <RotateCcw className="w-10 h-10" />}
              </div>
              <h2 className="text-3xl font-serif mb-2">
                {quizScore >= 0.8 ? "Great Job!" : "Not Quite There"}
              </h2>
              <p className="text-gray-600 mb-8">
                You scored {Math.round(quizScore * 100)}% on this {
                  quizType === 'module' ? 'module mastery quiz' : 
                  quizType === 'baseline' ? 'baseline assessment' : 
                  quizType === 'submodule' ? 'submodule check' :
                  'final exam'
                }.
              </p>

              {/* Skill Bars */}
              <div className="text-left space-y-6 mb-10">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Skill Metrics</h4>
                {Object.entries(skillScores).map(([skill, score]) => (
                  <div key={skill} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{skill}</span>
                      <span className="text-gray-500">{Math.round(score * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${score * 100}%` }}
                        className={`h-full ${score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              {quizType === 'baseline' && (
                <div className="bg-blue-50 p-6 rounded-[32px] mb-8 text-left border border-blue-100">
                  <h4 className="text-blue-800 font-serif mb-2">Placement Results</h4>
                  <p className="text-sm text-blue-700 mb-4">
                    Based on your diagnostic performance, we've determined your optimal starting point.
                  </p>
                  <div className="flex flex-col gap-2">
                    <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-[10px] font-bold uppercase w-fit">
                      Assigned Level: {entryLevel}
                    </span>
                    {weakAreas.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-bold text-red-600 uppercase mb-2">Foundational Gaps Detected:</p>
                        <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                          {weakAreas.map((area, i) => (
                            <li key={i}>{area}</li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-gray-500 mt-2 italic">Recommendation: Review foundational modules and extra practice resources provided in your roadmap.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {adaptiveMessage && (quizType === 'module' || quizType === 'submodule') && (
                <div className="bg-gray-50 p-4 rounded-2xl mb-8 text-sm text-gray-700 italic border-l-4 border-[#5A5A40]">
                  "{adaptiveMessage}"
                </div>
              ) || quizType === 'submodule' && quizScore >= 0.8 && (
                <div className="bg-green-50 p-4 rounded-2xl mb-8 text-sm text-green-700 italic border-l-4 border-green-500">
                  "Submodule mastered! You're one step closer to module mastery."
                </div>
              )}
              
              <div className="space-y-3">
                {quizType === 'baseline' ? (
                  <button 
                    onClick={() => setView("roadmap")}
                    className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:opacity-90 transition-opacity"
                  >
                    Start Your Learning Journey
                  </button>
                ) : quizType === 'final' ? (
                  <button 
                    onClick={() => setView("selection")}
                    className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:opacity-90 transition-opacity"
                  >
                    Back to Career Paths
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        if (nextAdaptiveStep) {
                          if (nextAdaptiveStep.action === "next" || nextAdaptiveStep.action === "previous") {
                            const targetModule = currentCourse.modules.find(m => m.id === nextAdaptiveStep.nextModuleId);
                            if (targetModule) {
                              startModule(targetModule, nextAdaptiveStep.nextLevel);
                              return;
                            }
                          } else if (nextAdaptiveStep.action === "change_level" || nextAdaptiveStep.action === "revisit") {
                            if (currentModule) {
                              startModule(currentModule, nextAdaptiveStep.nextLevel);
                              return;
                            }
                          }
                        }
                        setView("roadmap");
                      }}
                      className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                      {nextAdaptiveStep?.action === "next" ? "Continue to Next Step" : 
                       nextAdaptiveStep?.action === "previous" ? "Revisit Previous Topic" :
                       nextAdaptiveStep?.action === "change_level" ? "Try New Explanation Level" :
                       "Review & Try Again"}
                    </button>
                    
                    {quizScore < 0.8 && (
                      <button 
                        onClick={() => setView("roadmap")}
                        className="w-full border border-gray-200 text-gray-500 py-4 rounded-full font-medium hover:bg-gray-50 transition-all"
                      >
                        Back to Roadmap
                      </button>
                    )}
                    
                    <p className="text-xs text-gray-400 mt-4">
                      {attempts >= 3 ? "Adaptive AI suggests a change in strategy." : "Keep going! You're learning."}
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function QuizView({ questions, onSubmit, onCancel, title }: { 
  questions: QuizQuestion[], 
  onSubmit: (score: number, mistakes: string[], categoryResults: Record<string, { correct: number, total: number }>) => void,
  onCancel: () => void,
  title?: string
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [categoryResults, setCategoryResults] = useState<Record<string, { correct: number, total: number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="bg-white p-12 rounded-[32px] text-center">
        <Zap className="w-12 h-12 text-[#5A5A40] mx-auto mb-4 animate-bounce" />
        <h3 className="text-xl font-serif">Generating adaptive questions...</h3>
      </div>
    );
  }

  const handleNext = () => {
    if (selected === null) return;
    
    const isCorrect = selected === questions[currentIdx].correctIndex;
    const category = questions[currentIdx].category;
    
    // Update category results
    const newCategoryResults = { ...categoryResults };
    if (!newCategoryResults[category]) {
      newCategoryResults[category] = { correct: 0, total: 0 };
    }
    newCategoryResults[category].total += 1;
    if (isCorrect) {
      newCategoryResults[category].correct += 1;
    }
    setCategoryResults(newCategoryResults);

    const mistakeId = questions[currentIdx].moduleId || questions[currentIdx].question;
    const updatedMistakes = isCorrect ? mistakes : [...mistakes, mistakeId];
    if (!isCorrect) {
      setMistakes(updatedMistakes);
    }

    const newAnswers = [...answers, selected];
    setAnswers(newAnswers);
    setSelected(null);
    setShowExplanation(false);

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      if (isSubmitting) return;
      setIsSubmitting(true);
      const correctCount = newAnswers.filter((a, i) => a === questions[i].correctIndex).length;
      onSubmit(correctCount / questions.length, updatedMistakes, newCategoryResults);
    }
  };

  const current = questions[currentIdx];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto bg-white p-10 rounded-[32px] shadow-sm"
    >
      <div className="flex justify-between items-center mb-8">
        <span className="text-sm font-medium text-gray-400">Question {currentIdx + 1} of {questions.length}</span>
        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#5A5A40] transition-all duration-500" 
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {title && <h2 className="text-xl font-serif mb-4 text-[#5A5A40]">{title}</h2>}

      <h3 className="text-2xl font-serif mb-8">{current.question}</h3>

      <div className="space-y-3 mb-10">
        {current.options.map((opt, idx) => (
          <button 
            key={idx}
            onClick={() => !showExplanation && setSelected(idx)}
            className={`w-full text-left p-4 rounded-2xl border transition-all ${
              selected === idx 
                ? 'border-[#5A5A40] bg-[#5A5A40]/5' 
                : 'border-gray-200 hover:border-gray-400'
            } ${showExplanation && idx === current.correctIndex ? 'border-green-500 bg-green-50' : ''}
              ${showExplanation && selected === idx && idx !== current.correctIndex ? 'border-red-500 bg-red-50' : ''}
            `}
            disabled={showExplanation}
          >
            {opt}
          </button>
        ))}
      </div>

      {showExplanation && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-8 p-4 bg-gray-50 rounded-2xl text-sm text-gray-600"
        >
          <p className="font-bold mb-1">Explanation:</p>
          {current.explanation}
        </motion.div>
      )}

      <div className="flex gap-4">
        {!showExplanation ? (
          <button 
            onClick={() => selected !== null && setShowExplanation(true)}
            disabled={selected === null}
            className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-full font-medium disabled:opacity-50"
          >
            Check Answer
          </button>
        ) : (
          <button 
            onClick={handleNext}
            disabled={isSubmitting}
            className="flex-1 bg-[#5A5A40] text-white py-4 rounded-full font-medium disabled:opacity-70"
          >
            {isSubmitting ? "Submitting..." : (currentIdx < questions.length - 1 ? "Next Question" : "Finish Quiz")}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default App;
