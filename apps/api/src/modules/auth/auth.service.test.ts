import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const originalEnv = { ...process.env };

const user = {
  id: "4a44b220-a577-4502-bc7d-ab789f90429d",
  email: "shopper@example.com",
  name: "Shopper",
};

const prisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  extensionAuthFlow: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
};

const jwt = {
  signAsync: vi.fn(async () => "signed.jwt.token.with.enough.length"),
};

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      NODE_ENV: "test",
      API_PORT: "8787",
      API_PUBLIC_URL: "http://localhost:8787",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "test-secret-with-enough-length",
      GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
      CORS_ORIGIN: "https://bazaarlens.xyz",
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("checks lowercased emails before creating email users", async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    const service = createService();

    await expect(
      service.register({ email: "Shopper@Example.com", password: "password123", name: "Shopper" }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "shopper@example.com" } });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("verifies Google ID tokens, upserts the user, and writes an audit event", async () => {
    prisma.user.upsert.mockResolvedValue(user);
    const service = createService({
      email: "Shopper@Example.com",
      name: "Shopper",
      sub: "google-sub-123",
    });

    const response = await service.googleLogin({ idToken: "google.id.token.with.enough.length" });

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "shopper@example.com" },
      update: {
        googleSub: "google-sub-123",
        name: "Shopper",
        provider: "GOOGLE",
      },
      create: {
        email: "shopper@example.com",
        name: "Shopper",
        googleSub: "google-sub-123",
        provider: "GOOGLE",
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        type: "auth.login",
        payload: { provider: "GOOGLE" },
      },
    });
    expect(response.user).toEqual(user);
    expect(response.accessToken).toBe("signed.jwt.token.with.enough.length");
  });

  it("links an extension flow through a website-authenticated user and returns a one-time token", async () => {
    const service = createService();

    const started = await service.startExtensionAuth();
    const createdFlow = prisma.extensionAuthFlow.create.mock.calls[0]?.[0].data;

    expect(started.userCode).toMatch(/^\d{6}$/);
    expect(started.verificationUri).toBe("https://bazaarlens.xyz/");
    expect(started.verificationUriComplete).toContain(`extension_flow=${started.flowId}`);
    expect(createdFlow.pollTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdFlow.pollTokenHash).not.toBe(started.pollToken);

    prisma.extensionAuthFlow.findUnique.mockResolvedValueOnce({
      id: started.flowId,
      userCode: started.userCode,
      expiresAt: createdFlow.expiresAt,
      completedAt: null,
      consumedAt: null,
    });
    prisma.extensionAuthFlow.update.mockResolvedValue({});

    await expect(service.completeExtensionAuth(user.id, { flowId: started.flowId })).resolves.toMatchObject({
      flowId: started.flowId,
      status: "completed",
    });

    prisma.extensionAuthFlow.findUnique.mockResolvedValueOnce({
      id: started.flowId,
      userCode: started.userCode,
      pollTokenHash: createdFlow.pollTokenHash,
      userId: user.id,
      expiresAt: createdFlow.expiresAt,
      completedAt: new Date(),
      consumedAt: null,
    });
    prisma.extensionAuthFlow.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue(user);

    const polled = await service.pollExtensionAuth({
      flowId: started.flowId,
      pollToken: started.pollToken,
    });

    expect(prisma.extensionAuthFlow.update).toHaveBeenCalledWith({
      where: { id: started.flowId },
      data: { userId: user.id, completedAt: expect.any(Date) },
    });
    expect(prisma.extensionAuthFlow.updateMany).toHaveBeenCalledWith({
      where: {
        id: started.flowId,
        consumedAt: null,
        completedAt: { not: null },
        userId: { not: null },
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(polled).toMatchObject({
      status: "completed",
      auth: {
        accessToken: "signed.jwt.token.with.enough.length",
        user,
      },
    });
  });
});

function createService(payload = { email: user.email, name: user.name, sub: "google-sub-123" }) {
  const service = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
  const googleClient = {
    verifyIdToken: vi.fn(async () => ({
      getPayload: () => payload,
    })),
  };
  (
    service as unknown as {
      googleClient: typeof googleClient;
    }
  ).googleClient = googleClient;
  return service;
}
