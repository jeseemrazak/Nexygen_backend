import { Controller, Get, Patch, Post, Body, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { SettingsService } from './settings.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { Roles } from '../auth/roles.decorator';
import { assertValidImageFile } from '../common/file-validation';

@Controller('settings/company')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // No @Roles — every print page across the app (any authenticated role) needs to read this.
  @Get()
  get() {
    return this.service.getCompanySettings();
  }

  @Roles('ADMIN')
  @Patch()
  update(@Body() dto: UpdateCompanySettingsDto) {
    return this.service.updateCompanySettings(dto);
  }

  @Roles('ADMIN')
  @Post('logo')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/logos',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `logo-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
        return cb(new BadRequestException('Only JPEG, PNG, or WEBP images are allowed'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    assertValidImageFile(file.path);
    return this.service.updateLogo(`/uploads/logos/${file.filename}`);
  }
}
