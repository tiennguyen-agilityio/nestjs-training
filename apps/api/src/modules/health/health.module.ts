import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { terminusConfig } from '../../configs/terminus.config.js';
import { HealthController } from './controllers/health.controller.js';
import { DatabaseHealthIndicator } from './indicators/database-health.indicator.js';

@Module({
  imports: [
    TerminusModule.forRootAsync({
      inject: [ConfigService],
      useFactory: terminusConfig,
    }),
  ],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}
