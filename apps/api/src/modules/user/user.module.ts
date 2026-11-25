import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserService } from './services/user.service.js';
import { UserAddressService } from './services/user-address.service.js';
import { UserController } from './controllers/user.controller.js';
import { User } from './entities/user.entity.js';
import { UserAddress } from './entities/user-address.entity.js';
import { UserRepository } from './repositories/user.repository.js';
import { UserAddressRepository } from './repositories/user-address.repository.js';
import { UserRoleSyncHandler } from './handlers/user-role-sync.handler.js';

@Module({
  imports: [MikroOrmModule.forFeature([User, UserAddress])],
  providers: [
    UserService,
    UserRepository,
    UserAddressService,
    UserAddressRepository,
    UserRoleSyncHandler,
  ],
  controllers: [UserController],
  exports: [UserService, UserAddressService],
})
export class UserModule {}
