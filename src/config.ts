import "dotenv/config";
import { fileURLToPath } from "node:url";

export const config = {
  /** Rendered videos + working frames land here. */
  outDir: fileURLToPath(new URL("../out/", import.meta.url)),

  /** When true (or when creds are missing) we render but never publish. */
  dryRun: process.env.DRY_RUN === "true",

  /** Publish visibility for uploads: "public" | "unlisted" | "private". */
  privacy: (process.env.YT_PRIVACY ?? "unlisted") as
    | "public"
    | "unlisted"
    | "private",

  youtube: {
    clientId: process.env.YT_CLIENT_ID ?? "",
    clientSecret: process.env.YT_CLIENT_SECRET ?? "",
    refreshToken: process.env.YT_REFRESH_TOKEN ?? "",
  },
};

export function uploadConfigured(): boolean {
  return Boolean(
    config.youtube.clientId &&
      config.youtube.clientSecret &&
      config.youtube.refreshToken
  );
}
