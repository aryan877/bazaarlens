import { describe, expect, it } from "vitest";
import { isGoogleWebClientId, updateGoogleOAuthEnvText } from "./lib/google-oauth-env.mjs";

const clientId = "1234567890-abcdef.apps.googleusercontent.com";

describe("Google OAuth deployment env helpers", () => {
  it("validates Google web client ID shape", () => {
    expect(isGoogleWebClientId(clientId)).toBe(true);
    expect(isGoogleWebClientId("1234567890-abcdef")).toBe(false);
    expect(isGoogleWebClientId("https://1234567890-abcdef.apps.googleusercontent.com")).toBe(false);
  });

  it("updates API and web Google client IDs together", () => {
    const result = updateGoogleOAuthEnvText(
      ["GOOGLE_CLIENT_ID=", "GOOGLE_VERTEX_MODEL=gemini-3.5-flash", "VITE_GOOGLE_CLIENT_ID="].join("\n"),
      clientId,
    );

    expect(result).toContain(`GOOGLE_CLIENT_ID=${clientId}`);
    expect(result).toContain(`VITE_GOOGLE_CLIENT_ID=${clientId}`);
    expect(result).toContain("GOOGLE_VERTEX_MODEL=gemini-3.5-flash");
  });

  it("appends missing web runtime key", () => {
    const result = updateGoogleOAuthEnvText("GOOGLE_CLIENT_ID=\n", clientId);

    expect(result).toBe(`GOOGLE_CLIENT_ID=${clientId}\nVITE_GOOGLE_CLIENT_ID=${clientId}\n`);
  });
});
