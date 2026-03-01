import arcjet, { detectBot, shield } from "@arcjet/node";

if (
  !process.env.ARCJET_KEY &&
  process.env.ARCJET_ENV !== "test" &&
  process.env.NODE_ENV !== "test"
) {
  throw new Error(
    "ARCJET_KEY environment variable is not set. Please set it to your Arcjet site key."
  );
}

const isDevMode = process.env.NODE_ENV !== "production";

const aj = arcjet({
  // Get your site key from https://app.arcjet.com and set it as an environment
  // variable rather than hard coding.
  key: process.env.ARCJET_KEY!,
  rules: [
    // Shield protects your app from common attacks e.g. SQL injection
    shield({ mode: isDevMode ? "DRY_RUN" : "LIVE" }),
    // Create a bot detection rule
    detectBot({
      mode: isDevMode ? "DRY_RUN" : "LIVE",
      // Block all bots except the following
      allow: [
        "CATEGORY:SEARCH_ENGINE", // Google, Bing, etc
        "CATEGORY:PREVIEW", // Link previews e.g. Slack, Discord
        "CATEGORY:MONITOR", // Uptime monitoring services
      ],
    }),
    // Per-role rate limiting is handled in the security middleware
    // via aj.withRule() — no base sliding window needed here.
  ],
});

export default aj ;