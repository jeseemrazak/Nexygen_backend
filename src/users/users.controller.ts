import { Controller, Post, Get, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 🔥 ROUTE: POST /users/merchandiser
  @Roles('ADMIN')
  @Post('merchandiser')
  createMerchandiser(@Body() body: { name: string; email: string; password: string }) {
    return this.usersService.createMerchandiser(body);
  }

  // 🔥 ROUTE: GET /users/merchandisers
  @Roles('ADMIN')
  @Get('merchandisers')
  getMerchandisers() {
    return this.usersService.getMerchandisers();
  }
}