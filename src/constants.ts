export interface Submodule {
  id: string;
  title: string;
  order: number;
}

export interface Module {
  id: string;
  title: string;
  order: number;
  submodules: Submodule[];
}

export interface Course {
  id: string;
  title: string;
  role: string;
  difficulty: "Beginner" | "Intermediate" | "Expert";
  modules: Module[];
}

export const ROLES = [
  "Web Developer",
  "Data Scientist",
  "System Engineer",
  "Backend Developer",
  "Placement Preparation Kit"
];

// Helper to generate courses for each role
const generateCoursesForRole = (role: string): Course[] => [
  {
    id: `${role.toLowerCase().replace(/\s+/g, '-')}-beginner`,
    title: `${role} - Beginner Foundations`,
    role: role,
    difficulty: "Beginner",
    modules: [
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-b1`, 
        title: "Core Fundamentals", 
        order: 1,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b1-s1`, title: "Introduction to Concepts", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b1-s2`, title: "Basic Terminology", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b1-s3`, title: "Environment Setup", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b1-s4`, title: "First Steps & Syntax", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b1-s5`, title: "Foundational Practice", order: 5 },
        ]
      },
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-b2`, 
        title: "Basic Syntax & Logic", 
        order: 2,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b2-s1`, title: "Variables & Data Types", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b2-s2`, title: "Control Flow (If/Else)", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b2-s3`, title: "Loops & Iteration", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b2-s4`, title: "Functions & Scope", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b2-s5`, title: "Logic Exercises", order: 5 },
        ]
      },
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-b3`, 
        title: "Introductory Projects", 
        order: 3,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b3-s1`, title: "Project Planning", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b3-s2`, title: "Building Components", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b3-s3`, title: "State Management Basics", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b3-s4`, title: "Styling & Layout", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-b3-s5`, title: "Final Beginner Project", order: 5 },
        ]
      },
    ],
  },
  {
    id: `${role.toLowerCase().replace(/\s+/g, '-')}-intermediate`,
    title: `${role} - Intermediate Mastery`,
    role: role,
    difficulty: "Intermediate",
    modules: [
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-i1`, 
        title: "Advanced Concepts", 
        order: 1,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i1-s1`, title: "Asynchronous Patterns", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i1-s2`, title: "API Integration", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i1-s3`, title: "Error Handling", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i1-s4`, title: "Performance Optimization", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i1-s5`, title: "Advanced Practice", order: 5 },
        ]
      },
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-i2`, 
        title: "Design Patterns", 
        order: 2,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i2-s1`, title: "Creational Patterns", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i2-s2`, title: "Structural Patterns", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i2-s3`, title: "Behavioral Patterns", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i2-s4`, title: "Solid Principles", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i2-s5`, title: "Pattern Implementation", order: 5 },
        ]
      },
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-i3`, 
        title: "System Architecture", 
        order: 3,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i3-s1`, title: "Monolithic vs Microservices", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i3-s2`, title: "Database Design", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i3-s3`, title: "Caching Strategies", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i3-s4`, title: "Message Queues", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-i3-s5`, title: "Architecture Case Study", order: 5 },
        ]
      },
    ],
  },
  {
    id: `${role.toLowerCase().replace(/\s+/g, '-')}-expert`,
    title: `${role} - Expert Specialization`,
    role: role,
    difficulty: "Expert",
    modules: [
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-e1`, 
        title: "Scalability & Performance", 
        order: 1,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e1-s1`, title: "Load Balancing", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e1-s2`, title: "Horizontal Scaling", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e1-s3`, title: "Distributed Systems", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e1-s4`, title: "High Availability", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e1-s5`, title: "Scalability Lab", order: 5 },
        ]
      },
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-e2`, 
        title: "Security & Optimization", 
        order: 2,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e2-s1`, title: "Authentication & Authorization", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e2-s2`, title: "Encryption & Data Protection", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e2-s3`, title: "Security Auditing", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e2-s4`, title: "Advanced Optimization", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e2-s5`, title: "Security Challenge", order: 5 },
        ]
      },
      { 
        id: `${role.toLowerCase().replace(/\s+/g, '-')}-e3`, 
        title: "Industry Best Practices", 
        order: 3,
        submodules: [
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e3-s1`, title: "CI/CD Pipelines", order: 1 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e3-s2`, title: "Infrastructure as Code", order: 2 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e3-s3`, title: "Monitoring & Observability", order: 3 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e3-s4`, title: "DevOps Culture", order: 4 },
          { id: `${role.toLowerCase().replace(/\s+/g, '-')}-e3-s5`, title: "Expert Capstone", order: 5 },
        ]
      },
    ],
  },
];

export const COURSES: Course[] = ROLES.flatMap(generateCoursesForRole);
