import { config } from "../config";
import type { Track } from "../db/schema";

interface GoalValidationResult {
  isRealistic: boolean;
  result: "realistic" | "too_aggressive" | "too_easy";
  feedback: string;
}

interface GoalRecommendation {
  weightAdvice: string;
  waistAdvice: string;
  personalTip: string;
}

export const llmService = {
  async validateGoal(params: {
    track: Track;
    currentWeight: number;
    currentWaist: number;
    height: number;
    targetWeight: number;
    targetWaist: number;
    durationMonths: number;
  }): Promise<GoalValidationResult> {
    // If no API key configured, return a default validation
    if (!config.openRouterApiKey) {
      console.warn("OpenRouter API key not configured, skipping LLM validation");
      return {
        isRealistic: true,
        result: "realistic",
        feedback: "Цель принята (автоматическая валидация отключена)",
      };
    }

    const prompt = buildValidationPrompt(params);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "moonshotai/kimi-k2.5",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        console.error("LLM API error:", response.status, await response.text());
        return {
          isRealistic: true,
          result: "realistic",
          feedback: "Не удалось проверить цель, принята автоматически",
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      return parseValidationResponse(content);
    } catch (error) {
      console.error("LLM validation error:", error);
      return {
        isRealistic: true,
        result: "realistic",
        feedback: "Ошибка валидации, цель принята автоматически",
      };
    }
  },

  async getGoalRecommendation(params: {
    track: Track;
    currentWeight: number;
    currentWaist: number;
    height: number;
    durationMonths: number;
    recommendedWeight: number;
    recommendedWaist: number;
  }): Promise<GoalRecommendation | null> {
    if (!config.openRouterApiKey) {
      return null;
    }

    const prompt = buildRecommendationPrompt(params);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "moonshotai/kimi-k2.5",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        console.error("LLM API error:", response.status, await response.text());
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      return parseRecommendationResponse(content);
    } catch (error) {
      console.error("LLM recommendation error:", error);
      return null;
    }
  },
};

function buildRecommendationPrompt(params: {
  track: Track;
  currentWeight: number;
  currentWaist: number;
  height: number;
  durationMonths: number;
  recommendedWeight: number;
  recommendedWaist: number;
}): string {
  const trackDescription = params.track === "cut" ? "похудение (Cut)" : "набор массы (Bulk)";
  const bmi = params.currentWeight / Math.pow(params.height / 100, 2);

  return `Ты опытный фитнес-тренер. Дай краткий персонализированный совет по целям.

ДАННЫЕ:
- Трек: ${trackDescription}
- Текущий вес: ${params.currentWeight} кг
- Текущая талия: ${params.currentWaist} см
- Рост: ${params.height} см
- BMI: ${bmi.toFixed(1)}
- Срок: ${params.durationMonths} месяцев
- Рекомендуемый целевой вес: ${params.recommendedWeight} кг
- Рекомендуемая целевая талия: ${params.recommendedWaist} см

ОТВЕТЬ СТРОГО В ФОРМАТЕ:
СОВЕТ_ВЕС: [1 предложение о том, почему именно такой целевой вес оптимален]
СОВЕТ_ТАЛИЯ: [1 предложение о целевом обхвате талии]
ЛИЧНЫЙ_СОВЕТ: [1-2 предложения с персональной мотивирующей рекомендацией]`;
}

function parseRecommendationResponse(content: string): GoalRecommendation | null {
  const weightMatch = content.match(/СОВЕТ_ВЕС:\s*(.+?)(?=СОВЕТ_ТАЛИЯ:|$)/is);
  const waistMatch = content.match(/СОВЕТ_ТАЛИЯ:\s*(.+?)(?=ЛИЧНЫЙ_СОВЕТ:|$)/is);
  const tipMatch = content.match(/ЛИЧНЫЙ_СОВЕТ:\s*(.+)/is);

  if (!weightMatch && !waistMatch && !tipMatch) {
    return null;
  }

  return {
    weightAdvice: weightMatch?.[1]?.trim() || "",
    waistAdvice: waistMatch?.[1]?.trim() || "",
    personalTip: tipMatch?.[1]?.trim() || "",
  };
}

function buildValidationPrompt(params: {
  track: Track;
  currentWeight: number;
  currentWaist: number;
  height: number;
  targetWeight: number;
  targetWaist: number;
  durationMonths: number;
}): string {
  const trackDescription = params.track === "cut" ? "похудение (Cut)" : "набор массы (Bulk)";
  const weightChange = params.targetWeight - params.currentWeight;
  const waistChange = params.targetWaist - params.currentWaist;

  return `Ты эксперт по фитнесу и здоровому образу жизни. Оцени реалистичность фитнес-цели.

ДАННЫЕ УЧАСТНИКА:
- Трек: ${trackDescription}
- Текущий вес: ${params.currentWeight} кг
- Целевой вес: ${params.targetWeight} кг (изменение: ${weightChange > 0 ? "+" : ""}${weightChange} кг)
- Текущая талия: ${params.currentWaist} см
- Целевая талия: ${params.targetWaist} см (изменение: ${waistChange > 0 ? "+" : ""}${waistChange} см)
- Рост: ${params.height} см
- Срок: ${params.durationMonths} месяцев

КРИТЕРИИ ОЦЕНКИ:
- Для похудения (Cut): безопасная потеря 0.5-1 кг в неделю, талия может уменьшаться на 1-2 см в месяц
- Для набора массы (Bulk): здоровый набор 0.25-0.5 кг в неделю, талия может немного увеличиться

ОТВЕТЬ СТРОГО В ФОРМАТЕ:
РЕЗУЛЬТАТ: [realistic|too_aggressive|too_easy]
ОБОСНОВАНИЕ: [краткое объяснение на русском, 1-2 предложения]`;
}

function parseValidationResponse(content: string): GoalValidationResult {
  const resultMatch = content.match(/РЕЗУЛЬТАТ:\s*(realistic|too_aggressive|too_easy)/i);
  const feedbackMatch = content.match(/ОБОСНОВАНИЕ:\s*(.+)/is);

  const result = (resultMatch?.[1]?.toLowerCase() || "realistic") as GoalValidationResult["result"];
  const feedback = feedbackMatch?.[1]?.trim() || "Цель оценена автоматически";

  return {
    isRealistic: result === "realistic",
    result,
    feedback,
  };
}
