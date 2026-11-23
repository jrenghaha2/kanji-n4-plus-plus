import type {
  AppDatasetMode,
  IrodoriBookId,
  QuizDatasetId,
  QuizSessionHistoryEntry,
  QuizTypeChoice,
} from './kanji';

export type UserRole = 'user' | 'admin' | 'superadmin';

export type LiveActivityType =
  | 'browsing'
  | 'flashcard'
  | 'list'
  | 'quiz_setup'
  | 'quiz_running'
  | 'quiz_result'
  | 'admin_panel';

export type ActivityEventType =
  | 'quiz_started'
  | 'quiz_completed'
  | 'progress_milestone';

export type AdminPresenceStatus = 'online' | 'recent' | 'offline';

export type AdminSortOption =
  | 'recent'
  | 'alpha_asc'
  | 'alpha_desc'
  | 'mastered_desc'
  | 'quiz_desc';

export type AdminPanelTab = 'realtime' | 'events' | 'users';

export interface QuizLiveState {
  inProgress: boolean;
  stage: 'setup' | 'run' | 'result';
  currentQuestion: number;
  totalQuestions: number;
  correctCount: number;
  mode: QuizTypeChoice | '';
  datasetId: QuizDatasetId;
  scopeLabel: string;
}

export interface LiveActivityData {
  uid: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  activityType: LiveActivityType;
  datasetMode: AppDatasetMode;
  datasetId: QuizDatasetId;
  moduleLabel: string;
  scopeLabel: string;
  quizInProgress: boolean;
  quizCurrentQuestion: number;
  quizTotalQuestions: number;
  quizCorrectCount: number;
  quizMode: QuizTypeChoice | '';
  totalMastered: number;
  totalHard: number;
  n4Mastered: number;
  irodoriMastered: number;
  totalQuizSessions: number;
  lastQuizScore: number; // -1 if no completed quiz yet
  lastQuizTotal: number;
  lastQuizDatasetId: QuizDatasetId | '';
  updatedAtMs: number | null;
}

export interface ActivityEventData {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  eventType: ActivityEventType;
  datasetId: QuizDatasetId;
  moduleLabel: string;
  scopeLabel: string;
  quizMode: QuizTypeChoice | '';
  score: number;
  correct: number;
  total: number;
  totalMastered: number;
  summary: string;
  createdAtMs: number | null;
}

export interface AdminUserRecord {
  uid: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  n4MasteredCount: number;
  n4HardCount: number;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

export interface HydratedUserStats {
  uid: string;
  irodoriMasteredByBook: Record<IrodoriBookId, number>;
  irodoriHardByBook: Record<IrodoriBookId, number>;
  irodoriMasteredTotal: number;
  irodoriHardTotal: number;
  totalQuizSessions: number;
  lastQuizScore: number; // -1 if none
  lastQuizTotal: number;
  lastQuizDatasetId: QuizDatasetId | '';
  lastQuizCompletedAtMs: number | null;
}

export interface MonitoredUserRow {
  uid: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  isBootstrapSuperAdmin: boolean;
  presence: AdminPresenceStatus;
  lastActiveMs: number | null;
  hasLiveDoc: boolean;
  hasHydratedLegacy: boolean;
  activityType: LiveActivityType | null;
  moduleLabel: string;
  scopeLabel: string;
  quizInProgress: boolean;
  quizCurrentQuestion: number;
  quizTotalQuestions: number;
  quizCorrectCount: number;
  quizMode: QuizTypeChoice | '';
  n4Mastered: number;
  n4Hard: number;
  irodoriMastered: number;
  totalMastered: number;
  totalHard: number;
  totalQuizSessions: number;
  lastQuizScore: number; // -1 if none
  lastQuizTotal: number;
  lastQuizDatasetId: QuizDatasetId | '';
  createdAtMs: number | null;
}

export interface AdminKpiSummary {
  onlineCount: number;
  activeQuizCount: number;
  totalUsers: number;
  totalQuizSessions: number;
}

export interface UserModuleProgressBreakdown {
  datasetId: QuizDatasetId;
  label: string;
  shortLabel: string;
  masteredCount: number;
  hardCount: number;
  totalItems: number;
}

export interface UserDetailQuizEntry extends QuizSessionHistoryEntry {
  datasetId: QuizDatasetId;
}

export interface UserDetailData {
  uid: string;
  modules: UserModuleProgressBreakdown[];
  quizSessions: UserDetailQuizEntry[];
  totalMastered: number;
  totalHard: number;
  totalQuizSessions: number;
  loadedAtMs: number;
}
