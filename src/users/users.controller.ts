import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateMerchandiserDto } from './dto/update-merchandiser.dto';
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

  // GET /users/all — every user regardless of role, for staff-assignment dropdowns
  @Get('all')
  getAll() {
    return this.usersService.getAll();
  }

  // 🔥 ROUTE: PATCH /users/merchandiser/:id — edit details and/or reset password
  @Roles('ADMIN')
  @Patch('merchandiser/:id')
  updateMerchandiser(@Param('id') id: string, @Body() dto: UpdateMerchandiserDto) {
    return this.usersService.updateMerchandiser(Number(id), dto);
  }
}