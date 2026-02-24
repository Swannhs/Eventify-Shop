import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [OrchestratorService]
})
export class AppModule {}
