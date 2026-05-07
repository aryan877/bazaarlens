import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  health() {
    return this.healthService.liveness();
  }

  @Get("live")
  live() {
    return this.healthService.liveness();
  }

  @Get("ready")
  ready() {
    return this.healthService.readiness();
  }
}
