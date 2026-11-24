import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { InventoryMovement } from './entities/inventory-movement.entity.js';
import { OrderRepository } from './repositories/order.repository.js';
import { OrderService } from './services/order.service.js';
import { OrderController } from './controllers/order.controller.js';
import { CartModule } from '../cart/cart.module.js';
import { ProductVariantModule } from '../product-variant/product-variant.module.js';
import { ShippingMethodModule } from '../shipping-method/shipping-method.module.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([Order, OrderItem, Payment, InventoryMovement]),
    CartModule,
    ProductVariantModule,
    ShippingMethodModule,
  ],
  providers: [OrderService, OrderRepository],
  controllers: [OrderController],
})
export class OrderModule {}
