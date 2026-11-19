const assemble = (...parts: string[]) => parts.join("");

export const FAKE_SECRETS = {
  awsAccessKey: assemble("AKIA", "ABCDEFGHIJKLMNOP"),
  highEntropy: assemble("Zx81hQ2pLm09TrvB", "7kWq3yN6cJd4sFa5GeU1oIm8"),
  githubToken: assemble("ghp_", "abcdefghijklmnopqrstuvwxyz0123456789"),
  slackToken: assemble("xoxb-", "1234567890-abcdefghij"),
  liveSecretKey: assemble("sk_", "live_abcDEF123456789"),
  testSecretKey: assemble("sk_", "test_abcDEF123456789"),
  livePublishableKey: assemble("pk_", "live_Y2xlcmsuNG1pY2EuaW8k"),
  sentryToken: assemble("sntrys_", "eyJpYXQiOjE3MDAwMDAwMDB9_abcdef"),
} as const;
