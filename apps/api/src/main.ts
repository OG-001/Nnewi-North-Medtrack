import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { ServerResponse } from "node:http";
import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });

  app.setGlobalPrefix("api/v1");

  // Security headers on API responses. The PWA gets its own set from nginx;
  // these cover the JSON surface, which is served on the same origin in
  // production (NDPA compliance rule, section 6).
  app.use((_req: unknown, res: ServerResponse, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // An API response is never a document; deny everything.
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    // Patient data must not be cached by an intermediary.
    res.setHeader("Cache-Control", "no-store");
    res.removeHeader("X-Powered-By");
    next();
  });

  // Trust the reverse proxy so rate limiting sees the real client address
  // rather than the proxy's, which would rate-limit every clinic as one caller.
  app.set("trust proxy", 1);

  // A patient payload is small; a large body is either a bug or an attack.
  // Nest's own body-parser hook, so express is not imported directly: it is a
  // transitive dependency and pnpm's strict resolution rightly refuses that.
  app.useBodyParser("json", { limit: "2mb" });
  // Request bodies are validated per-route with ZodValidationPipe (see *.dto.ts).
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(","),
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`PHC-Track sync hub listening on :${port}/api/v1`);
}

void bootstrap();
