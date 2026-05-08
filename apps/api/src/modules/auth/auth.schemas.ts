import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const GoogleLoginSchema = z.object({
  idToken: z.string().min(20),
});

export const ExtensionAuthFlowIdSchema = z.string().uuid();

export const ExtensionAuthCompleteSchema = z.object({
  flowId: ExtensionAuthFlowIdSchema,
});

export const ExtensionAuthPollSchema = z.object({
  flowId: ExtensionAuthFlowIdSchema,
  pollToken: z.string().min(32).max(256),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;
export type ExtensionAuthCompleteInput = z.infer<typeof ExtensionAuthCompleteSchema>;
export type ExtensionAuthPollInput = z.infer<typeof ExtensionAuthPollSchema>;
