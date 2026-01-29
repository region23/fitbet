import { config } from "../config";
import type { Track } from "../db/schema";

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

export interface GoalValidationResult {
  isRealistic: boolean;
  result: "realistic" | "too_aggressive" | "too_easy";
  feedback: string;
}

interface GoalRecommendation {
  weightAdvice: string;
  waistAdvice: string;
  personalTip: string;
}

export interface GoalValidationParams {
  track: Track;
  currentWeight: number;
  currentWaist: number;
  height: number;
  targetWeight: number;
  targetWaist: number;
  durationMonths: number;
}

export interface CheckinRecommendationResult {
  progressAssessment: string;
  bodyCompositionNotes: string;
  nutritionAdvice: string;
  trainingAdvice: string;
  motivationalMessage: string;
  warningFlags: string[];
  tokensUsed?: number;
  processingTimeMs: number;
}

export interface CheckinRecommendationParams {
  // Participant context
  track: Track;
  height: number;
  targetWeight: number;
  targetWaist: number;
  durationMonths: number;

  // Baseline (start)
  startWeight: number;
  startWaist: number;
  startPhotosBase64: {
    front: string;
    left: string;
    right: string;
    back: string;
  } | null; // null for first checkin

  // Current checkin
  currentWeight: number;
  currentWaist: number;
  currentPhotosBase64: {
    front: string;
    left: string;
    right: string;
    back: string;
  };

  // History
  checkinNumber: number;
  totalCheckins: number;
  previousCheckins: Array<{
    number: number;
    weight: number;
    waist: number;
    date: Date;
  }>;

  // Discipline
  completedCheckins: number;

  // Commitments
  commitments: string[];
}

export const llmService = {
  /**
   * Validate goal using google/gemini-3-flash-preview model
   */
  async validateGoal(params: GoalValidationParams): Promise<GoalValidationResult> {
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

    console.log("LLM validation prompt:", prompt);

    try {
      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.openRouterApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 3000,
            temperature: 0.3,
            stream: false,
          }),
        },
        30000 // 30 second timeout
      );

      if (!response.ok) {
        console.error("LLM API error:", response.status, await response.text());
        return {
          isRealistic: true,
          result: "realistic",
          feedback: "Не удалось проверить цель, принята автоматически",
        };
      }

      const data = await response.json();
      console.log("LLM API full response:", JSON.stringify(data, null, 2));

      const content = data.choices?.[0]?.message?.content || "";
      console.log("LLM validation response content:", content);

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
      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.openRouterApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000,
            temperature: 0.5,
            stream: false,
          }),
        },
        30000 // 30 second timeout
      );

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

  /**
   * Get checkin recommendations with vision analysis
   */
  async getCheckinRecommendations(
    params: CheckinRecommendationParams
  ): Promise<CheckinRecommendationResult> {
    if (!config.openRouterApiKey) {
      throw new Error("OpenRouter API key not configured");
    }

    const startTime = Date.now();

    // Build multimodal prompt
    const { textPrompt, visionContent } = buildCheckinPrompt(
      params,
      params.currentPhotosBase64,
      params.startPhotosBase64
    );

    try {
      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.openRouterApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: textPrompt }, ...visionContent],
              },
            ],
            max_tokens: 4000,
            temperature: 0.7,
            stream: false,
          }),
        },
        45000 // 45 second timeout for vision API
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("LLM API error:", response.status, errorText);
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const tokensUsed = data.usage?.total_tokens;

      console.log("LLM checkin recommendation response:", content);

      const processingTimeMs = Date.now() - startTime;

      return {
        ...parseCheckinResponse(content),
        tokensUsed,
        processingTimeMs,
      };
    } catch (error) {
      console.error("LLM checkin recommendation error:", error);
      throw error;
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

function buildCheckinPrompt(
  params: CheckinRecommendationParams,
  currentPhotos: { front: string; left: string; right: string; back: string },
  startPhotos: { front: string; left: string; right: string; back: string } | null
) {
  const trackDescription = params.track === "cut" ? "похудение (Cut)" : "набор массы (Bulk)";

  // Calculate changes
  const weightChange = params.currentWeight - params.startWeight;
  const waistChange = params.currentWaist - params.startWaist;

  // Calculate BMI and WHtR
  const currentBMI = params.currentWeight / Math.pow(params.height / 100, 2);
  const currentWHtR = params.currentWaist / params.height;

  // Build history section
  let historySection = "";
  if (params.previousCheckins.length > 0) {
    historySection = "\n\nИСТОРИЯ ПРОШЛЫХ ЧЕК-ИНОВ:\n";
    params.previousCheckins.forEach((checkin) => {
      historySection += `- Чек-ин #${checkin.number}: ${checkin.weight} кг / ${checkin.waist} см\n`;
    });
  }

  // Build commitments section
  let commitmentsSection = "";
  if (params.commitments.length > 0) {
    commitmentsSection = `\n\nОБЯЗАТЕЛЬСТВА УЧАСТНИКА:\n${params.commitments.map((c) => `- ${c}`).join("\n")}`;
  }

  const textPrompt = `Ты опытный фитнес-тренер и нутрициолог. Проанализируй прогресс участника на основе метрик и фотографий.

КОНТЕКСТ УЧАСТНИКА:
- Трек: ${trackDescription}
- Рост: ${params.height} см
- Длительность челленджа: ${params.durationMonths} месяцев
- Текущий чек-ин: #${params.checkinNumber} из ${params.totalCheckins}
- Дисциплина: ${params.completedCheckins}/${params.totalCheckins} чек-инов

ЦЕЛЕВЫЕ ПОКАЗАТЕЛИ:
- Целевой вес: ${params.targetWeight} кг
- Целевая талия: ${params.targetWaist} см

СТАРТОВЫЕ ПОКАЗАТЕЛИ:
- Вес: ${params.startWeight} кг
- Талия: ${params.startWaist} см

ТЕКУЩИЕ ПОКАЗАТЕЛИ:
- Вес: ${params.currentWeight} кг (${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} кг от старта)
- Талия: ${params.currentWaist} см (${waistChange > 0 ? "+" : ""}${waistChange.toFixed(1)} см от старта)
- BMI: ${currentBMI.toFixed(1)}
- WHtR: ${currentWHtR.toFixed(2)}${historySection}${commitmentsSection}

ФОТОГРАФИИ:
Ниже представлены текущие фотографии участника (анфас, профиль слева, профиль справа, со спины).${startPhotos ? " После текущих фото идут стартовые фото для сравнения." : ""}

ОТВЕТЬ СТРОГО В ФОРМАТЕ:
ПРОГРЕСС: [оценка динамики за период, 2-3 предложения]
ВИЗУАЛЬНЫЕ_ИЗМЕНЕНИЯ: [видимые изменения в композиции тела, 2-3 предложения]
ПИТАНИЕ: [конкретные рекомендации по питанию, 2-3 предложения]
ТРЕНИРОВКИ: [рекомендации по тренировкам, 2-3 предложения]
МОТИВАЦИЯ: [мотивирующее сообщение, 1-2 предложения]
ПРЕДУПРЕЖДЕНИЯ: [тревожные признаки через запятую, или "нет"]`;

  // Build vision content array
  const visionContent = [
    {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${currentPhotos.front}`,
        detail: "low" as const,
      },
    },
    {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${currentPhotos.left}`,
        detail: "low" as const,
      },
    },
    {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${currentPhotos.right}`,
        detail: "low" as const,
      },
    },
    {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${currentPhotos.back}`,
        detail: "low" as const,
      },
    },
  ];

  // Add start photos if available (for comparison)
  if (startPhotos) {
    visionContent.push(
      {
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${startPhotos.front}`,
          detail: "low" as const,
        },
      },
      {
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${startPhotos.left}`,
          detail: "low" as const,
        },
      },
      {
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${startPhotos.right}`,
          detail: "low" as const,
        },
      },
      {
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${startPhotos.back}`,
          detail: "low" as const,
        },
      }
    );
  }

  return { textPrompt, visionContent };
}

function parseCheckinResponse(content: string): Omit<
  CheckinRecommendationResult,
  "tokensUsed" | "processingTimeMs"
> {
  const progressMatch = content.match(/ПРОГРЕСС:\s*(.+?)(?=ВИЗУАЛЬНЫЕ_ИЗМЕНЕНИЯ:|$)/is);
  const bodyMatch = content.match(/ВИЗУАЛЬНЫЕ_ИЗМЕНЕНИЯ:\s*(.+?)(?=ПИТАНИЕ:|$)/is);
  const nutritionMatch = content.match(/ПИТАНИЕ:\s*(.+?)(?=ТРЕНИРОВКИ:|$)/is);
  const trainingMatch = content.match(/ТРЕНИРОВКИ:\s*(.+?)(?=МОТИВАЦИЯ:|$)/is);
  const motivationMatch = content.match(/МОТИВАЦИЯ:\s*(.+?)(?=ПРЕДУПРЕЖДЕНИЯ:|$)/is);
  const warningsMatch = content.match(/ПРЕДУПРЕЖДЕНИЯ:\s*(.+)/is);

  const warningsText = warningsMatch?.[1]?.trim() || "нет";
  const warningFlags =
    warningsText.toLowerCase() === "нет"
      ? []
      : warningsText
          .split(",")
          .map((w) => w.trim())
          .filter((w) => w.length > 0);

  return {
    progressAssessment: progressMatch?.[1]?.trim() || "Продолжайте работать над целями",
    bodyCompositionNotes: bodyMatch?.[1]?.trim() || "Видны положительные изменения",
    nutritionAdvice: nutritionMatch?.[1]?.trim() || "Следите за балансом питания",
    trainingAdvice: trainingMatch?.[1]?.trim() || "Продолжайте регулярные тренировки",
    motivationalMessage: motivationMatch?.[1]?.trim() || "Отличная работа! 💪",
    warningFlags,
  };
}
