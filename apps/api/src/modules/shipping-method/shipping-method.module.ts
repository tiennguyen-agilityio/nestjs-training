import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ShippingMethod } from './entities/shipping-method.entity.js';
import { ShippingMethodRepository } from './repositories/shipping-method.repository.js';
import { ShippingMethodService } from './services/shipping-method.service.js';
import { ShippingMethodController } from './controllers/shipping-method.controller.js';

@Module({
  imports: [MikroOrmModule.forFeature([ShippingMethod])],
  providers: [ShippingMethodService, ShippingMethodRepository],
  controllers: [ShippingMethodController],
})
export class ShippingMethodModule {}
