import type { Track } from "../db/schema";

export interface OnboardingData {
  challengeId?: number;
  resumeParticipantId?: number;
  resumePromptEnabled?: boolean;
  resumePromptComplete?: boolean;
  pendingText?: string;
  track?: Track;
  weight?: number;
  waist?: number;
  height?: number;
  photoFrontId?: string;
  photoProfileId?: string;
  targetWeight?: number;
  targetWaist?: number;
  selectedCommitments?: number[];
}

export interface ChallengeSetupData {
  chatId?: number;
  chatTitle?: string;
  durationMonths?: number;
  stakeAmount?: number;
  disciplineThreshold?: number;
  maxSkips?: number;
}

export interface CheckinData {
  windowId?: number;
  weight?: number;
  waist?: number;
  photoFrontId?: string;
  photoProfileId?: string;
}

export interface SessionData {
  onboarding?: OnboardingData;
  challengeSetup?: ChallengeSetupData;
  checkin?: CheckinData;
}

export function createInitialSessionData(): SessionData {
  return {};
}
