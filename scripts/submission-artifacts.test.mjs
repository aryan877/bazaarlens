import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("submission artifact checker", () => {
  it("passes the development submission artifact gate with actionable warnings", () => {
    const result = runSubmissionCheck([]);

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(true);
    expect(output.finalMode).toBe(false);
    expect(output.checks.every((check) => check.passed)).toBe(true);
    expect(output.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Production env example selects a valid Devpost track", passed: true }),
        expect.objectContaining({ name: "Submission guide names MongoDB as selected track", passed: true }),
      ]),
    );
    expect(output.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Repository is private during development"),
        expect.stringContaining("Demo video is still pending"),
      ]),
    );
  });

  it("fails final mode until public repository and demo video fields are filled", () => {
    const result = runSubmissionCheck(["--final"]);

    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.ok).toBe(false);
    expect(output.finalMode).toBe(true);
    expect(output.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Final submission requires public/judge-access repository"),
        expect.stringContaining("Final submission requires demo video URL"),
      ]),
    );
  });
});

function runSubmissionCheck(args) {
  return spawnSync(process.execPath, ["scripts/check-submission-artifacts.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}
