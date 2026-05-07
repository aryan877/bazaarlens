import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service.js";
import type { PrismaService } from "./prisma/prisma.service.js";

const originalEnv = { ...process.env };

describe("HealthService", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns readiness checks without leaking secrets", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      GOOGLE_VERTEX_PROJECT: "",
      GOOGLE_CLOUD_PROJECT: "bazaarlens-gcp-project",
      GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    };
    const prisma = { $queryRaw: vi.fn(async () => [{ health: 1 }]) };

    const readiness = await new HealthService(prisma as unknown as PrismaService).readiness();

    expect(readiness).toMatchObject({
      ok: true,
      service: "bazaarlens-api",
      checks: {
        database: "ok",
        ai: "google-vertex-configured",
        agentMemory: "disabled",
        google: "configured",
        cors: "restricted",
      },
    });
    expect(JSON.stringify(readiness)).not.toContain("bazaarlens-gcp-project");
  });

  it("returns 503 readiness when the database is unavailable", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
    };
    const prisma = { $queryRaw: vi.fn(async () => Promise.reject(new Error("db down"))) };

    await expect(new HealthService(prisma as unknown as PrismaService).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
