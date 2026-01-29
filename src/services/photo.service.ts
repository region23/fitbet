import fs from "node:fs/promises";
import path from "node:path";
import type { Bot, Api } from "grammy";
import { config } from "../config";

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

type PhotoAngle = "front" | "left" | "right" | "back";

interface PhotoSet {
  front: string;
  left: string;
  right: string;
  back: string;
}

export const photoService = {
  /**
   * Download and save a single photo from Telegram
   */
  async downloadAndSavePhoto(
    api: Api,
    fileId: string,
    participantId: number,
    checkinNumber: number | "start",
    angle: PhotoAngle
  ): Promise<string> {
    // Get file info from Telegram
    const file = await api.getFile(fileId);
    if (!file.file_path) {
      throw new Error(`No file path for file_id: ${fileId}`);
    }

    // Download from Telegram
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const response = await fetchWithTimeout(fileUrl, {}, 20000); // 20 second timeout for photo download
    if (!response.ok) {
      throw new Error(`Failed to download photo: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Create directory structure
    const dir = path.join(
      config.photosDirectory,
      participantId.toString(),
      checkinNumber === "start" ? "start" : `checkin-${checkinNumber}`
    );
    await fs.mkdir(dir, { recursive: true });

    // Save to disk
    const localPath = path.join(dir, `${angle}.jpg`);
    await fs.writeFile(localPath, buffer);

    return localPath;
  },

  /**
   * Download and save all 4 photos for a checkin in parallel
   */
  async downloadAndSavePhotos(
    api: Api,
    fileIds: { front: string; left: string; right: string; back: string },
    participantId: number,
    checkinNumber: number | "start"
  ): Promise<PhotoSet> {
    const [front, left, right, back] = await Promise.all([
      this.downloadAndSavePhoto(api, fileIds.front, participantId, checkinNumber, "front"),
      this.downloadAndSavePhoto(api, fileIds.left, participantId, checkinNumber, "left"),
      this.downloadAndSavePhoto(api, fileIds.right, participantId, checkinNumber, "right"),
      this.downloadAndSavePhoto(api, fileIds.back, participantId, checkinNumber, "back"),
    ]);

    return { front, left, right, back };
  },

  /**
   * Load a saved photo as base64
   */
  async loadPhotoAsBase64(localPath: string): Promise<string> {
    const buffer = await fs.readFile(localPath);
    return buffer.toString("base64");
  },

  /**
   * Create vision payload for OpenRouter API
   */
  createVisionPayload(base64Image: string, description: string) {
    return {
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${base64Image}`,
        detail: "low" as const, // 85 tokens per image instead of 765+
      },
    };
  },

  /**
   * Load all 4 photos as base64 for LLM analysis
   */
  async loadPhotosAsBase64(photoPaths: PhotoSet): Promise<{
    front: string;
    left: string;
    right: string;
    back: string;
  }> {
    const [front, left, right, back] = await Promise.all([
      this.loadPhotoAsBase64(photoPaths.front),
      this.loadPhotoAsBase64(photoPaths.left),
      this.loadPhotoAsBase64(photoPaths.right),
      this.loadPhotoAsBase64(photoPaths.back),
    ]);

    return { front, left, right, back };
  },
};
