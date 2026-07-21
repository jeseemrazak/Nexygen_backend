import { IsIn } from 'class-validator';

export class UpdateQuotationStatusDto {
  @IsIn(['SENT', 'ACCEPTED', 'REJECTED'])
  status: 'SENT' | 'ACCEPTED' | 'REJECTED';
}
