import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AuthResponse,
  ExtensionAuthDetailsResponse,
  ExtensionAuthPollResponse,
  ExtensionAuthStartResponse,
} from "@bazaarlens/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEnv } from "../../shared/env.js";
import { toPrismaJson } from "../../shared/json.js";
import type {
  ExtensionAuthCompleteInput,
  ExtensionAuthPollInput,
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
} from "./auth.schemas.js";

const EXTENSION_AUTH_TTL_MS = 10 * 60 * 1000;
const EXTENSION_AUTH_POLL_INTERVAL_SECONDS = 3;

@Injectable()
export class AuthService {
  private readonly env = getEnv();
  private readonly googleClient = new OAuth2Client(this.env.GOOGLE_CLIENT_ID || undefined);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email already registered");

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name ?? null,
        passwordHash: await hash(input.password, 12),
        provider: "EMAIL",
      },
    });

    await this.audit(user.id, "auth.register", { provider: "EMAIL" });
    return this.toAuthResponse(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user?.passwordHash) throw new UnauthorizedException("Invalid email or password");
    if (!(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    await this.audit(user.id, "auth.login", { provider: "EMAIL" });
    return this.toAuthResponse(user);
  }

  async googleLogin(input: GoogleLoginInput): Promise<AuthResponse> {
    if (!this.env.GOOGLE_CLIENT_ID) {
      throw new UnauthorizedException("Google OAuth is not configured");
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: input.idToken,
      audience: this.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException("Google token missing email");
    }

    const user = await this.prisma.user.upsert({
      where: { email: payload.email.toLowerCase() },
      update: {
        googleSub: payload.sub,
        name: payload.name ?? undefined,
        provider: "GOOGLE",
      },
      create: {
        email: payload.email.toLowerCase(),
        name: payload.name ?? null,
        googleSub: payload.sub,
        provider: "GOOGLE",
      },
    });

    await this.audit(user.id, "auth.login", { provider: "GOOGLE" });
    return this.toAuthResponse(user);
  }

  async me(userId: string): Promise<AuthResponse["user"]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { id: user.id, email: user.email, name: user.name };
  }

  async startExtensionAuth(): Promise<ExtensionAuthStartResponse> {
    const flowId = randomUUID();
    const pollToken = randomBytes(32).toString("base64url");
    const userCode = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + EXTENSION_AUTH_TTL_MS);

    await this.prisma.extensionAuthFlow.create({
      data: {
        id: flowId,
        userCode,
        pollTokenHash: hashPollToken(pollToken),
        expiresAt,
      },
    });

    const verificationUri = getVerificationUri(this.env);
    const verificationUriComplete = new URL(verificationUri);
    verificationUriComplete.searchParams.set("extension_flow", flowId);

    return {
      flowId,
      userCode,
      pollToken,
      expiresAt: expiresAt.toISOString(),
      verificationUri,
      verificationUriComplete: verificationUriComplete.toString(),
      intervalSeconds: EXTENSION_AUTH_POLL_INTERVAL_SECONDS,
    };
  }

  async extensionAuthDetails(flowId: string): Promise<ExtensionAuthDetailsResponse> {
    const flow = await this.prisma.extensionAuthFlow.findUnique({
      where: { id: flowId },
      select: {
        id: true,
        userCode: true,
        expiresAt: true,
        completedAt: true,
      },
    });
    if (!flow) throw new NotFoundException("Extension sign-in flow not found");
    if (flow.expiresAt.getTime() <= Date.now()) throw new GoneException("Extension sign-in expired");

    return {
      flowId: flow.id,
      userCode: flow.userCode,
      expiresAt: flow.expiresAt.toISOString(),
      status: flow.completedAt ? "completed" : "pending",
    };
  }

  async completeExtensionAuth(
    userId: string,
    input: ExtensionAuthCompleteInput,
  ): Promise<ExtensionAuthDetailsResponse> {
    const flow = await this.prisma.extensionAuthFlow.findUnique({
      where: { id: input.flowId },
      select: {
        id: true,
        userCode: true,
        expiresAt: true,
        completedAt: true,
        consumedAt: true,
      },
    });
    if (!flow) throw new NotFoundException("Extension sign-in flow not found");
    if (flow.expiresAt.getTime() <= Date.now()) throw new GoneException("Extension sign-in expired");
    if (flow.completedAt || flow.consumedAt) throw new BadRequestException("Extension sign-in already completed");

    const completedAt = new Date();
    await this.prisma.extensionAuthFlow.update({
      where: { id: flow.id },
      data: { userId, completedAt },
    });
    await this.audit(userId, "auth.extension.complete", { flowId: flow.id });

    return {
      flowId: flow.id,
      userCode: flow.userCode,
      expiresAt: flow.expiresAt.toISOString(),
      status: "completed",
    };
  }

  async pollExtensionAuth(input: ExtensionAuthPollInput): Promise<ExtensionAuthPollResponse> {
    const flow = await this.prisma.extensionAuthFlow.findUnique({
      where: { id: input.flowId },
      select: {
        id: true,
        userCode: true,
        pollTokenHash: true,
        userId: true,
        expiresAt: true,
        completedAt: true,
        consumedAt: true,
      },
    });
    if (!flow) throw new NotFoundException("Extension sign-in flow not found");
    if (!isSamePollTokenHash(flow.pollTokenHash, hashPollToken(input.pollToken))) {
      throw new UnauthorizedException("Invalid extension sign-in token");
    }
    if (flow.expiresAt.getTime() <= Date.now()) throw new GoneException("Extension sign-in expired");
    if (!flow.completedAt || !flow.userId) {
      return {
        status: "pending",
        userCode: flow.userCode,
        expiresAt: flow.expiresAt.toISOString(),
      };
    }
    if (flow.consumedAt) throw new UnauthorizedException("Extension sign-in already consumed");

    const consumed = await this.prisma.extensionAuthFlow.updateMany({
      where: {
        id: flow.id,
        consumedAt: null,
        completedAt: { not: null },
        userId: { not: null },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new UnauthorizedException("Extension sign-in already consumed");

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: flow.userId } });
    await this.audit(user.id, "auth.extension.poll", { flowId: flow.id });

    return {
      status: "completed",
      auth: await this.toAuthResponse(user),
    };
  }

  private async audit(userId: string, type: string, payload: Record<string, unknown>) {
    await this.prisma.auditEvent.create({ data: { userId, type, payload: toPrismaJson(payload) } });
  }

  private async toAuthResponse(user: { id: string; email: string; name: string | null }): Promise<AuthResponse> {
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}

function hashPollToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSamePollTokenHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getVerificationUri(env: ReturnType<typeof getEnv>): string {
  const configuredOrigin = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).find(Boolean);
  if (configuredOrigin) return new URL("/", configuredOrigin).toString();

  const apiUrl = new URL(env.API_PUBLIC_URL);
  if (apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1") {
    apiUrl.port = "3000";
  } else if (apiUrl.hostname.startsWith("api.")) {
    apiUrl.hostname = apiUrl.hostname.slice("api.".length);
  }
  apiUrl.pathname = "/";
  apiUrl.search = "";
  apiUrl.hash = "";
  return apiUrl.toString();
}
