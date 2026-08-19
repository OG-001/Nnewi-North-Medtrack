import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });

  app.setGlobalPrefix("api/v1");
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
