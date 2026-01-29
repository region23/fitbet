import { config } from "../config";
import type { Track } from "../db/schema";

export interface GoalValidationResult {
  isRealistic: boolean;
  result: "realistic" | "too_aggressive" | "too_easy";
  feedback: string;
  reasoning?: string;
}

export interface StreamingOptions {
  onReasoningChunk?: (reasoning: string) => Promise<void>;
  onContentChunk?: (content: string) => Promise<void>;
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

export const llmService = {
  /**
   * Validate goal with streaming reasoning display
   * Uses moonshotai/kimi-k2.5 reasoning model with SSE streaming
   */
  async validateGoalStreaming(
    params: GoalValidationParams,
    options: StreamingOptions = {}
  ): Promise<GoalValidationResult> {
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
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "moonshotai/kimi-k2.5",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 5000,
          temperature: 0.3,
          stream: true,
          reasoning: { enabled: true },
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

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader available");
      }

      const decoder = new TextDecoder();
      let reasoning = "";
      let content = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            // Reasoning tokens (from reasoning_content or reasoning_details)
            if (delta?.reasoning_content) {
              reasoning += delta.reasoning_content;
              if (options.onReasoningChunk) {
                await options.onReasoningChunk(reasoning);
              }
            }
            // Alternative format: reasoning_details array
            if (delta?.reasoning_details) {
              const reasoningChunk = delta.reasoning_details[0]?.thinking || "";
              if (reasoningChunk) {
                reasoning += reasoningChunk;
                if (options.onReasoningChunk) {
                  await options.onReasoningChunk(reasoning);
                }
              }
            }

            // Content tokens
            if (delta?.content) {
              content += delta.content;
              if (options.onContentChunk) {
                await options.onContentChunk(content);
              }
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      console.log("LLM reasoning:", reasoning);
      console.log("LLM content:", content);

      return {
        ...parseValidationResponse(content),
        reasoning: reasoning || undefined,
      };
    } catch (error) {
      console.error("LLM validation error:", error);
      return {
        isRealistic: true,
        result: "realistic",
        feedback: "Ошибка валидации, цель принята автоматически",
      };
    }
  },

  /**
   * Non-streaming validation (fallback/legacy)
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
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "moonshotai/kimi-k2.5",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 5000,
          temperature: 0.3,
          stream: false,
          reasoning: { enabled: true },
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
      console.log("LLM API full response:", JSON.stringify(data, null, 2));

      const content = data.choices?.[0]?.message?.content || "";
      const reasoning = data.choices?.[0]?.message?.reasoning_content ||
                       data.choices?.[0]?.message?.reasoning_details?.[0]?.thinking || "";
      console.log("LLM validation response content:", content);
      console.log("LLM validation reasoning:", reasoning);

      return {
        ...parseValidationResponse(content),
        reasoning: reasoning || undefined,
      };
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
          max_tokens: 2000,
          temperature: 0.5,
          stream: false,
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
