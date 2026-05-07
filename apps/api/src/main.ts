import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./modules/app.module.js";
import { getEnv } from "./shared/env.js";
import { configureHttp, corsOptions } from "./shared/http.js";

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: corsOptions(env), bodyParser: false });
  configureHttp(app, env);

  await app.listen(env.API_PORT, "0.0.0.0");
}

void bootstrap();
