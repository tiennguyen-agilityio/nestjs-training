import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Cart } from './entities/cart.entity.js';
import { CartItem } from './entities/cart-item.entity.js';
import { CartRepository } from './repositories/cart.repository.js';
import { CartItemRepository } from './repositories/cart-item.repository.js';
import { CartService } from './services/cart.service.js';
import { CartController } from './controllers/cart.controller.js';
import { ProductVariantModule } from '../product-variant/product-variant.module.js';

@Module({
  imports: [MikroOrmModule.forFeature([Cart, CartItem]), ProductVariantModule],
  providers: [CartService, CartRepository, CartItemRepository],
  controllers: [CartController],
  exports: [CartService],
})
export class CartModule {}
