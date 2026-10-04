import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags, PartialType } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { HighlightDto, PartnerDto, PhotoDto, TestimonialDto, UpdateShowcaseSettingsDto } from './dto/showcase.dto';
import { MANAGEMENT } from '../common/roles';
import { ShowcaseDraftDto } from './dto/showcase-draft.dto';
import { MAX_UPLOAD_BYTES, ShowcaseService } from './showcase.service';

class UpdateHighlightDto extends PartialType(HighlightDto) {}
class UpdatePhotoDto extends PartialType(PhotoDto) {}
class UpdatePartnerDto extends PartialType(PartnerDto) {}
class UpdateTestimonialDto extends PartialType(TestimonialDto) {}

/** Back-office management of the public showcase (same roles as the "Annonces & Vitrine" menu). */
@Controller('showcase')
@ApiTags('Showcase (admin)')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MANAGEMENT)
@ApiBearerAuth()
export class ShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.showcase.getSettings(user);
  }

  /** The draft being prepared, beside what is published. */
  @Get('draft')
  getDraft(@CurrentUser() user: AuthUser) {
    return this.showcase.getDraft(user);
  }

  @Put('draft')
  saveDraft(@CurrentUser() user: AuthUser, @Body() dto: ShowcaseDraftDto) {
    return this.showcase.saveDraft(user, dto);
  }

  @Delete('draft')
  discardDraft(@CurrentUser() user: AuthUser) {
    return this.showcase.discardDraft(user);
  }

  @Post('publish')
  publish(@CurrentUser() user: AuthUser) {
    return this.showcase.publish(user);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateShowcaseSettingsDto) {
    return this.showcase.updateSettings(user, dto);
  }

  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@UploadedFile() file: { buffer: Buffer; size: number } | undefined) {
    return this.showcase.saveUpload(file);
  }

  // ---------- Key figures ----------
  @Post('highlights')
  createHighlight(@CurrentUser() user: AuthUser, @Body() dto: HighlightDto) {
    return this.showcase.create(user, 'highlights', { ...dto });
  }

  @Patch('highlights/:id')
  updateHighlight(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateHighlightDto) {
    return this.showcase.update(user, 'highlights', id, { ...dto });
  }

  @Delete('highlights/:id')
  removeHighlight(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.showcase.remove(user, 'highlights', id);
  }

  // ---------- Gallery ----------
  @Post('photos')
  createPhoto(@CurrentUser() user: AuthUser, @Body() dto: PhotoDto) {
    return this.showcase.create(user, 'photos', { ...dto });
  }

  @Patch('photos/:id')
  updatePhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePhotoDto) {
    return this.showcase.update(user, 'photos', id, { ...dto });
  }

  @Delete('photos/:id')
  removePhoto(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.showcase.remove(user, 'photos', id);
  }

  // ---------- Partners ----------
  @Post('partners')
  createPartner(@CurrentUser() user: AuthUser, @Body() dto: PartnerDto) {
    return this.showcase.create(user, 'partners', { ...dto });
  }

  @Patch('partners/:id')
  updatePartner(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.showcase.update(user, 'partners', id, { ...dto });
  }

  @Delete('partners/:id')
  removePartner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.showcase.remove(user, 'partners', id);
  }

  // ---------- Testimonials ----------
  @Post('testimonials')
  createTestimonial(@CurrentUser() user: AuthUser, @Body() dto: TestimonialDto) {
    return this.showcase.create(user, 'testimonials', { ...dto });
  }

  @Patch('testimonials/:id')
  updateTestimonial(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTestimonialDto) {
    return this.showcase.update(user, 'testimonials', id, { ...dto });
  }

  @Delete('testimonials/:id')
  removeTestimonial(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.showcase.remove(user, 'testimonials', id);
  }
}
