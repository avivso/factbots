/**
 * YouTube upload over plain fetch (the googleapis transport throws "Premature
 * close" from some environments — native fetch + retry is what goalcast learned
 * to trust). Resumable upload, then sets the thumbnail.
 */
import { readFileSync } from "node:fs";
import { config } from "./config.js";

const UPLOAD = "https://youtube.googleapis.com/upload/youtube/v3";

async function freshAccessToken(): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.youtube.clientId,
          client_secret: config.youtube.clientSecret,
          refresh_token: config.youtube.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const j = (await r.json()) as any;
      if (r.ok && j.access_token) return j.access_token as string;
      throw new Error(`token ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
    } catch (err) {
      lastErr = err;
      console.warn(`  yt token attempt ${attempt}/5 failed:`, (err as Error).message);
      if (attempt < 5) await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("yt token fetch failed");
}

async function ytFetch(url: string, init: RequestInit, token: string, retries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      });
    } catch (err) {
      lastErr = err;
      console.warn(`  yt ${init.method ?? "GET"} attempt ${attempt}/${retries} failed:`, (err as Error).message);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("yt fetch failed");
}

export interface UploadMeta {
  title: string;
  description: string;
  tags: string[];
  thumbPath?: string;
}

export async function uploadShort(videoPath: string, meta: UploadMeta): Promise<string> {
  const token = await freshAccessToken();
  const bytes = readFileSync(videoPath);

  const body = {
    snippet: {
      title: meta.title.slice(0, 100),
      description: meta.description,
      tags: meta.tags,
      categoryId: "27", // Education
    },
    status: { privacyStatus: config.privacy, selfDeclaredMadeForKids: false },
  };

  // 1. open resumable session
  const start = await ytFetch(
    `${UPLOAD}/videos?part=snippet,status&uploadType=resumable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: JSON.stringify(body),
    },
    token,
    1
  );
  if (!start.ok) throw new Error(`upload start ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const session = start.headers.get("location");
  if (!session) throw new Error("upload start: no resumable session URL");

  // 2. send the bytes (Shorts are small — one shot)
  const put = await ytFetch(session, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: bytes }, token, 1);
  if (!put.ok) throw new Error(`upload PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
  const j = (await put.json()) as any;
  if (!j.id) throw new Error("upload: response had no video id");
  const videoId = j.id as string;

  // 3. thumbnail (best effort)
  if (meta.thumbPath) {
    try {
      await ytFetch(
        `${UPLOAD}/thumbnails/set?videoId=${videoId}&uploadType=media`,
        { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: readFileSync(meta.thumbPath) },
        token,
        2
      );
    } catch (err) {
      console.warn("  thumbnail set failed (non-fatal):", (err as Error).message);
    }
  }

  return `https://youtube.com/shorts/${videoId}`;
}
