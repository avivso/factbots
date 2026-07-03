/**
 * One-time YouTube OAuth. Prints a consent URL, catches the localhost redirect,
 * exchanges the code, and prints the refresh token to paste into .env.
 *
 * Prereqs (Google Cloud console, all free):
 *   1. Create a project, enable "YouTube Data API v3".
 *   2. OAuth consent screen: External; add your Google account as a Test user.
 *   3. Credentials -> Create OAuth client ID -> "Web application";
 *      Authorized redirect URI: http://localhost:8089/callback
 *   4. Put YT_CLIENT_ID / YT_CLIENT_SECRET in .env, then:  npm run auth
 *
 * IMPORTANT: on the account chooser, pick the Google/Brand account that OWNS
 * the channel you want to publish to — a token for the wrong account reads fine
 * but uploads fail with "youtubeSignupRequired".
 */
import "dotenv/config";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const clientId = process.env.YT_CLIENT_ID;
const clientSecret = process.env.YT_CLIENT_SECRET;
const REDIRECT = "http://localhost:8089/callback";

if (!clientId || !clientSecret) {
  console.error("Set YT_CLIENT_ID and YT_CLIENT_SECRET in .env first (see the header of this file).");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    scope: "https://www.googleapis.com/auth/youtube.upload",
  }).toString();

console.log("\nOpening your browser to approve access. If it doesn't open, paste this URL:\n\n" + authUrl + "\n");
spawn("open", [authUrl], { stdio: "ignore" }).on("error", () => {});

const server = createServer(async (req, res) => {
  const code = new URL(req.url!, "http://localhost:8089").searchParams.get("code");
  if (!code) {
    res.end("No code in callback.");
    return;
  }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });
    const j = (await r.json()) as any;
    if (!j.refresh_token) {
      res.end("No refresh token returned. Revoke the app at myaccount.google.com/permissions and retry.");
      console.error("\nNo refresh_token in response:", JSON.stringify(j, null, 2));
      process.exit(1);
    }
    res.end("Done! Refresh token printed in your terminal. You can close this tab.");
    console.log("\n✅ Add this line to your .env:\n");
    console.log(`YT_REFRESH_TOKEN=${j.refresh_token}\n`);
  } catch (err) {
    res.end("Token exchange failed; see terminal.");
    console.error(err);
  } finally {
    setTimeout(() => process.exit(0), 500);
  }
});

server.listen(8089, () => console.log("Waiting for the redirect on http://localhost:8089/callback ...\n"));
