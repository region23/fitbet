import type { Participant, BankHolderVote } from "../db/schema";

export function selectBankHolderWinner(
  eligibleParticipants: Participant[],
  votes: BankHolderVote[],
  fallbackUserId?: number
): { winnerId: number; maxVotes: number } | null {
  if (eligibleParticipants.length === 0) return null;

  const eligibleIds = new Set(eligibleParticipants.map((p) => p.userId));
  const voteCount = new Map<number, number>();

  for (const id of eligibleIds) {
    voteCount.set(id, 0);
  }

  for (const vote of votes) {
    if (!eligibleIds.has(vote.votedForId)) continue;
    voteCount.set(vote.votedForId, (voteCount.get(vote.votedForId) || 0) + 1);
  }

  let maxVotes = 0;
  for (const count of voteCount.values()) {
    if (count > maxVotes) maxVotes = count;
  }

  const topCandidates = [...voteCount.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([candidateId]) => candidateId);

  if (maxVotes === 0) {
    if (fallbackUserId && eligibleIds.has(fallbackUserId)) {
      return { winnerId: fallbackUserId, maxVotes: 0 };
    }
  }

  const winnerId =
    topCandidates.length > 0
      ? Math.min(...topCandidates)
      : Math.min(...eligibleIds);

  return { winnerId, maxVotes };
}
