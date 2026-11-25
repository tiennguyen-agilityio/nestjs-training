import { Module } from '@nestjs/common';
import { InventoryController } from './controllers/inventory.controller.js';
import { InventoryService } from './services/inventory.service.js';
import { ProductVariantModule } from '../product-variant/product-variant.module.js';

@Module({
  imports: [ProductVariantModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
