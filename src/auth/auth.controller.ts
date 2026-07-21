import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('bootstrap-admin')
  bootstrapAdmin(@Body() body: any) {
    return this.authService.bootstrapAdmin(body);
  }

  @Public()
  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body.email, body.password);
  }
}