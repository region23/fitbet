import type { Track } from "../db/schema";

export interface RecommendedGoals {
  targetWeight: number;
  targetWaist: number;
  weightReason: string;
  waistReason: string;
}

export const metricsService = {
  /**
   * Calculate recommended goals based on scientific formulas:
   * - Weight: BMI-based ideal weight (optimal BMI ~22)
   * - Waist: Waist-to-Height Ratio (optimal WHtR ~0.45)
   */
  calculateRecommendedGoals(params: {
    track: Track;
    currentWeight: number;
    currentWaist: number;
    height: number;
    durationMonths: number;
  }): RecommendedGoals {
    const { track, currentWeight, currentWaist, height, durationMonths } = params;
    const heightM = height / 100;

    // Ideal weight based on BMI = 22 (middle of healthy range 18.5-24.9)
    const idealWeight = Math.round(22 * heightM * heightM);

    // Ideal waist based on WHtR = 0.45 (healthy < 0.5)
    const idealWaist = Math.round(height * 0.45);

    let targetWeight: number;
    let targetWaist: number;
    let weightReason: string;
    let waistReason: string;

    if (track === "cut") {
      // For Cut: target is minimum of (current - 10%) or (ideal + 5%)
      const weightLoss10Percent = Math.round(currentWeight * 0.9);
      const idealPlus5Percent = Math.round(idealWeight * 1.05);

      // Safe weekly loss: 0.5-1 kg/week
      const maxSafeLoss = durationMonths * 4 * 0.75; // ~0.75 kg/week average
      const safestTarget = Math.round(currentWeight - maxSafeLoss);

      // Choose the most conservative target
      targetWeight = Math.max(safestTarget, Math.min(weightLoss10Percent, idealPlus5Percent));

      // Calculate weekly rate for explanation
      const weeklyLoss = (currentWeight - targetWeight) / (durationMonths * 4);
      weightReason = `здоровый BMI ~22 для роста ${height} см, потеря ~${weeklyLoss.toFixed(1)} кг/неделю`;

      // Waist: minimum of (current - 5cm) or ideal
      targetWaist = Math.min(currentWaist - 5, idealWaist);
      waistReason = `оптимальное соотношение талия/рост 0.45`;
    } else {
      // For Bulk: target is ideal + 5-10%
      targetWeight = Math.round(idealWeight * 1.07);

      // Safe weekly gain: 0.25-0.5 kg/week
      const maxSafeGain = durationMonths * 4 * 0.35; // ~0.35 kg/week average
      const safestTarget = Math.round(currentWeight + maxSafeGain);

      // Choose the more conservative target
      targetWeight = Math.min(targetWeight, safestTarget);

      const weeklyGain = (targetWeight - currentWeight) / (durationMonths * 4);
      weightReason = `набор мышечной массы ~${weeklyGain.toFixed(2)} кг/неделю`;

      // Waist: may stay same or increase slightly (muscle)
      targetWaist = Math.round(currentWaist + 2);
      waistReason = `небольшое увеличение за счёт мышц кора`;
    }

    return {
      targetWeight,
      targetWaist,
      weightReason,
      waistReason,
    };
  },

  /**
   * Calculate current BMI
   */
  calculateBMI(weight: number, heightCm: number): number {
    const heightM = heightCm / 100;
    return weight / (heightM * heightM);
  },

  /**
   * Calculate Waist-to-Height Ratio
   */
  calculateWHtR(waist: number, height: number): number {
    return waist / height;
  },

  /**
   * Get BMI category
   */
  getBMICategory(bmi: number): string {
    if (bmi < 18.5) return "недостаточный вес";
    if (bmi < 25) return "норма";
    if (bmi < 30) return "избыточный вес";
    return "ожирение";
  },

  /**
   * Get WHtR health status
   */
  getWHtRStatus(whtr: number): string {
    if (whtr < 0.4) return "очень низкий";
    if (whtr < 0.5) return "здоровый";
    if (whtr < 0.6) return "повышенный риск";
    return "высокий риск";
  },
};
