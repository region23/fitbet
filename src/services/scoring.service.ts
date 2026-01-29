import { participantService } from "./participant.service";
import { goalService } from "./goal.service";
import { checkinService } from "./checkin.service";
import type { Participant, Goal, Challenge } from "../db/schema";

interface ParticipantScore {
  participant: Participant;
  goal: Goal | null;
  goalAchievement: number;     // 0-100%
  disciplineScore: number;      // 0-100%
  totalScore: number;           // Combined score
  isWinner: boolean;
  prizeShare: number;           // Share of the prize pool (0-1)
}

export const scoringService = {
  async calculateScores(challenge: Challenge): Promise<ParticipantScore[]> {
    const participants = await participantService.findActiveByChallenge(challenge.id);
    const scores: ParticipantScore[] = [];

    for (const participant of participants) {
      const goal = await goalService.findByParticipantId(participant.id);
      const checkins = await checkinService.getCheckinsByParticipant(participant.id);

      // Get latest check-in for final metrics
      const latestCheckin = checkins.sort(
        (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()
      )[0];

      const goalAchievement = calculateGoalAchievement(participant, goal, latestCheckin);
      const disciplineScore = calculateDisciplineScore(participant);

      // Total score: 70% goal achievement + 30% discipline
      const totalScore = goalAchievement * 0.7 + disciplineScore * 0.3;

      scores.push({
        participant,
        goal,
        goalAchievement,
        disciplineScore,
        totalScore,
        isWinner: false,
        prizeShare: 0,
      });
    }

    // Determine winners: those who meet discipline threshold and achieved goal
    const disciplineThreshold = challenge.disciplineThreshold * 100;

    const winners = scores.filter(
      (s) => s.disciplineScore >= disciplineThreshold && s.goalAchievement >= 80
    );

    const losers = scores.filter(
      (s) => !(s.disciplineScore >= disciplineThreshold && s.goalAchievement >= 80)
    );

    // Calculate prize pool and distribution
    if (winners.length > 0 && losers.length > 0) {
      const prizePool = losers.length * challenge.stakeAmount;
      const prizePerWinner = prizePool / winners.length;

      for (const winner of winners) {
        winner.isWinner = true;
        winner.prizeShare = prizePerWinner / challenge.stakeAmount;
      }
    } else if (winners.length === scores.length) {
      // Everyone won - everyone gets their stake back
      for (const score of scores) {
        score.isWinner = true;
        score.prizeShare = 0; // No additional prize, just refund
      }
    }

    // Sort by total score descending
    return scores.sort((a, b) => b.totalScore - a.totalScore);
  },

  formatResults(challenge: Challenge, scores: ParticipantScore[]): string {
    const winners = scores.filter((s) => s.isWinner);
    const losers = scores.filter((s) => !s.isWinner);

    let message = "🏆 *РЕЗУЛЬТАТЫ ЧЕЛЛЕНДЖА*\n\n";

    if (winners.length === 0) {
      message += "😔 К сожалению, никто не достиг цели.\n";
      message += "Все ставки возвращаются участникам.\n\n";
    } else if (losers.length === 0) {
      message += "🎉 Все участники достигли цели!\n";
      message += "Каждый получает свою ставку обратно.\n\n";
    } else {
      const prizePool = losers.length * challenge.stakeAmount;
      const prizePerWinner = prizePool / winners.length;

      message += "🏅 *ПОБЕДИТЕЛИ:*\n";
      for (const w of winners) {
        const name = w.participant.firstName || w.participant.username || `User ${w.participant.userId}`;
        message += `• ${name}: ${w.totalScore.toFixed(1)}% (+${prizePerWinner.toFixed(0)}₽)\n`;
      }

      message += "\n❌ *НЕ ДОСТИГЛИ ЦЕЛИ:*\n";
      for (const l of losers) {
        const name = l.participant.firstName || l.participant.username || `User ${l.participant.userId}`;
        message += `• ${name}: ${l.totalScore.toFixed(1)}%\n`;
      }
    }

    message += "\n📊 *ДЕТАЛИ:*\n";
    for (const s of scores) {
      const name = s.participant.firstName || s.participant.username || `User ${s.participant.userId}`;
      message += `\n*${name}*\n`;
      message += `  Цель: ${s.goalAchievement.toFixed(0)}%\n`;
      message += `  Дисциплина: ${s.disciplineScore.toFixed(0)}%\n`;
    }

    if (winners.length > 0 && losers.length > 0) {
      const bankHolder = challenge.bankHolderUsername || `ID: ${challenge.bankHolderId}`;
      message += `\n💰 *Bank Holder @${bankHolder}*, пожалуйста, распределите выигрыш.`;
    }

    return message;
  },
};

function calculateGoalAchievement(
  participant: Participant,
  goal: Goal | null,
  latestCheckin?: { weight: number; waist: number }
): number {
  if (!goal || !participant.startWeight || !latestCheckin) {
    return 0;
  }

  const track = participant.track;
  let weightProgress = 0;
  let waistProgress = 0;

  if (track === "cut") {
    // For cut: losing weight and waist
    if (goal.targetWeight && participant.startWeight > goal.targetWeight) {
      const totalWeightToLose = participant.startWeight - goal.targetWeight;
      const actualLost = participant.startWeight - latestCheckin.weight;
      weightProgress = Math.min(100, (actualLost / totalWeightToLose) * 100);
    }

    if (goal.targetWaist && participant.startWaist && participant.startWaist > goal.targetWaist) {
      const totalWaistToLose = participant.startWaist - goal.targetWaist;
      const actualLost = participant.startWaist - latestCheckin.waist;
      waistProgress = Math.min(100, (actualLost / totalWaistToLose) * 100);
    }
  } else {
    // For bulk: gaining weight (waist might also increase slightly)
    if (goal.targetWeight && participant.startWeight < goal.targetWeight) {
      const totalWeightToGain = goal.targetWeight - participant.startWeight;
      const actualGained = latestCheckin.weight - participant.startWeight;
      weightProgress = Math.min(100, (actualGained / totalWeightToGain) * 100);
    }

    // For bulk, waist is less important but we track it
    waistProgress = 100; // Waist tracking is optional for bulk
  }

  // Weight counts for 70%, waist for 30%
  return Math.max(0, weightProgress * 0.7 + waistProgress * 0.3);
}

function calculateDisciplineScore(participant: Participant): number {
  if (participant.totalCheckins === 0) {
    return 100; // No check-ins yet means no missed check-ins
  }

  return (participant.completedCheckins / participant.totalCheckins) * 100;
}
