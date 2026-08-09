import { IsString, IsOptional, IsBoolean, IsObject, IsIn, IsInt, IsNumber } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() website?: string;
  @IsString() @IsOptional() taxNumber?: string;
  @IsString() @IsOptional() footerNote?: string;
  @IsString() @IsOptional() termsAndConditions?: string;

  @IsBoolean() @IsOptional() reportShowLogo?: boolean;
  @IsBoolean() @IsOptional() reportShowAddress?: boolean;
  @IsBoolean() @IsOptional() reportShowPhone?: boolean;
  @IsBoolean() @IsOptional() reportShowEmail?: boolean;
  @IsBoolean() @IsOptional() reportShowWebsite?: boolean;
  @IsBoolean() @IsOptional() reportShowFooter?: boolean;

  @IsString() @IsOptional() reportHeaderColor?: string;
  @IsString() @IsOptional() reportAccentColor?: string;
  @IsIn(['portrait', 'landscape']) @IsOptional() reportOrientation?: string;
  @IsIn(['compact', 'normal', 'spacious']) @IsOptional() reportDensity?: string;
  @IsIn(['bordered', 'striped', 'minimal']) @IsOptional() reportBorderStyle?: string;
  @IsObject() @IsOptional() reportFieldsJson?: Record<string, string[]>;

  @IsInt() @IsOptional() posDefaultWarehouseId?: number;
  @IsInt() @IsOptional() posDefaultPaymentMethodId?: number;
  @IsBoolean() @IsOptional() posRequireCustomer?: boolean;
  @IsString() @IsOptional() posReceiptFooter?: string;
  @IsBoolean() @IsOptional() posAutoPrintReceipt?: boolean;
  @IsNumber() @IsOptional() posMaxDiscountPercent?: number;
  @IsBoolean() @IsOptional() posRequireCashCount?: boolean;

  @IsBoolean() @IsOptional() kotAutoPrint?: boolean;
  @IsString() @IsOptional() kotFooterText?: string;
}
