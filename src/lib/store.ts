"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  UserSettings,
  Task,
  Habit,
  SleepEntry,
  Exam,
  StudySession,
  Exercise,
  WorkoutLog,
  WorkoutSchedule,
  DailyPrayers,
  DailyHabits,
  TasbihEntry,
  QuranLog,
  DailyScore,
} from "./types";
import { loadUserData, saveAllUserData } from "./sync";

interface AppState {
  userId: string | null;
  isLoading: boolean;
  isSynced: boolean;
  setUserId: (userId: string | null) => void;
  loadData: (userId: string) => Promise<void>;
  syncData: () => Promise<void>;

  isOnboarded: boolean;
  userSettings: UserSettings;
  setUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
  completeOnboarding: () => void;

  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  habits: Habit[];
  dailyHabits: Record<string, DailyHabits>;
  addHabit: (habit: Habit) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  completeHabit: (id: string) => void;
  toggleHabitCompletion: (habitId: string, date: string) => void;

  sleepEntries: SleepEntry[];
  addSleepEntry: (entry: SleepEntry) => void;

  dailyPrayers: Record<string, DailyPrayers>;
  updatePrayer: (date: string, updates: Partial<DailyPrayers>) => void;

  tasbihEntries: TasbihEntry[];
  setTasbihEntries: (entries: TasbihEntry[]) => void;
  incrementTasbih: (index: number) => void;
  resetTasbih: (index: number) => void;

  quranLogs: QuranLog[];
  addQuranLog: (log: QuranLog) => void;

  exams: Exam[];
  addExam: (exam: Exam) => void;
  updateExam: (id: string, updates: Partial<Exam>) => void;
  deleteExam: (id: string) => void;

  studySessions: StudySession[];
  addStudySession: (session: StudySession) => void;

  exercises: Exercise[];
  addExercise: (exercise: Exercise) => void;
  updateExercise: (id: string, updates: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;

  workoutLogs: WorkoutLog[];
  addWorkoutLog: (log: WorkoutLog) => void;
  updateWorkoutLog: (id: string, updates: Partial<WorkoutLog>) => void;
  deleteWorkoutLog: (id: string) => void;

  workoutSchedule: WorkoutSchedule[];
  setWorkoutSchedule: (schedule: WorkoutSchedule[]) => void;

  getDailyScore: () => DailyScore;
}

const DEFAULT_EXERCISES: Exercise[] = [];
const DEFAULT_HABITS: Habit[] = [];
const DEFAULT_TASBIH: TasbihEntry[] = [];
const DEFAULT_USER_SETTINGS = {} as UserSettings;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      userId: null,
      isLoading: false,
      isSynced: false,
      setUserId: (userId) => set({ userId }),

      loadData: async (userId) => {
        set({ isLoading: true });
        try {
          const data = await loadUserData(userId);

          const cachedOnboarded = typeof window !== "undefined" && localStorage.getItem(`lifeos_onboarded_${userId}`);
          const isOnboarded = !!cachedOnboarded || !!(data.userSettings?.name && data.userSettings?.mainGoal);

          const today = new Date().toDateString();
          
          if (!data.dailyPrayers) {
            data.dailyPrayers = {};
          }
          
          if (!data.dailyPrayers[today]) {
            data.dailyPrayers[today] = {
              date: today, fajr: false, fajrMasjid: false, dhuhr: false, dhuhrMasjid: false,
              asr: false, asrMasjid: false, maghrib: false, maghribMasjid: false, isha: false,
              ishaMasjid: false, qadaCount: 0,
            };
          }

          const todayKey = new Date().toDateString();
          const processedDailyHabits = data.dailyHabits || {};

          const normalizedDailyHabits: Record<string, DailyHabits> = {};
          Object.entries(processedDailyHabits).forEach(([key, day]) => {
            try {
              const dateSource = (day && (day as any).date) || key;
              const dateObj = new Date(dateSource as string);
              const dateKey = dateObj.toDateString();
              const dbDate = dateObj.toISOString().split("T")[0];
              normalizedDailyHabits[dateKey] = { date: dbDate, completions: (day && (day as any).completions) || {} };
            } catch (e) {
              normalizedDailyHabits[key] = (day as DailyHabits) || { date: new Date().toISOString().split("T")[0], completions: {} };
            }
          });

          if (!normalizedDailyHabits[todayKey]) {
            normalizedDailyHabits[todayKey] = { date: new Date().toISOString().split("T")[0], completions: {} };
          }

          const habitsWithCompletion = (data.habits || []).map((h) => {
            const wasCompleted = !!(normalizedDailyHabits[todayKey] && normalizedDailyHabits[todayKey].completions[h.id]);
            return { ...h, completedToday: wasCompleted, lastCompletedAt: wasCompleted ? todayKey : h.lastCompletedAt };
          });

          set({
            userId,
            userSettings: data.userSettings,
            tasks: data.tasks || [],
            habits: habitsWithCompletion,
            sleepEntries: data.sleepEntries || [],
            dailyPrayers: data.dailyPrayers,
            dailyHabits: normalizedDailyHabits,
            tasbihEntries: data.tasbihEntries || [],
            quranLogs: data.quranLogs || [],
            exams: data.exams || [],
            studySessions: data.studySessions || [],
            exercises: data.exercises || [],
            workoutLogs: data.workoutLogs || [],
            workoutSchedule: data.workoutSchedule || [],
            isLoading: false,
            isSynced: true,
            isOnboarded,
          });
        } catch (error) {
          console.error("Error loading user data:", error);
          set({ isLoading: false });
        }
      },

      syncData: async () => {
        const { userId, userSettings, tasks, habits, sleepEntries, dailyPrayers, dailyHabits, tasbihEntries, quranLogs, exams, studySessions, exercises, workoutLogs, workoutSchedule } = get();
        if (!userId) {
          return;
        }

        try {
          await saveAllUserData(userId, {
            userSettings, tasks, habits, sleepEntries, dailyPrayers, dailyHabits, tasbihEntries,
            quranLogs, exams, studySessions, exercises, workoutLogs, workoutSchedule,
          });
        } catch (error) {
          console.error("Error syncing data:", error);
        }
      },

      isOnboarded: false,
      userSettings: DEFAULT_USER_SETTINGS,
      setUserSettings: async (settings) => {  },
      completeOnboarding: () => {  },

      tasks: [],
      addTask: (task) => {
        set((state) => ({ tasks: [...state.tasks, task] }));
        get().syncData();
      },
      updateTask: (id, updates) => {  },
      deleteTask: (id) => {  },

      habits: DEFAULT_HABITS,
      dailyHabits: {},
      addHabit: (habit) => {  },
      updateHabit: (id, updates) => {  },
      deleteHabit: (id) => {  },
      completeHabit: (id) => {  },
      toggleHabitCompletion: (habitId, date) => {  },

      sleepEntries: [],
      addSleepEntry: (entry) => {  },

      dailyPrayers: {},
      updatePrayer: (date, updates) => {  },

      tasbihEntries: DEFAULT_TASBIH,
      setTasbihEntries: (entries) => {  },
      incrementTasbih: (index) => {  },
      resetTasbih: (index) => {  },

      quranLogs: [],
      addQuranLog: (log) => {  },

      exams: [],
      addExam: (exam) => {  },
      updateExam: (id, updates) => {  },
      deleteExam: (id) => {  },

      studySessions: [],
      addStudySession: (session) => {  },

      exercises: DEFAULT_EXERCISES,
      addExercise: (exercise) => {  },
      updateExercise: (id, updates) => {  },
      deleteExercise: (id) => {  },

      workoutLogs: [],
      addWorkoutLog: (log) => {  },
      updateWorkoutLog: (id, updates) => {  },
      deleteWorkoutLog: (id) => {  },

      workoutSchedule: [],
      setWorkoutSchedule: (schedule) => {  },

      getDailyScore: () => ({} as DailyScore),
    }),
    {
      name: "storage",
      partialize: (state) => ({
        ...state,
        isLoading: false,
      }),
    }
  )
);
