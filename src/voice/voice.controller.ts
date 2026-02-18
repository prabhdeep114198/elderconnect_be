import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
    constructor(private readonly voiceService: VoiceService) { }

    @Post('transcribe')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('file'))
    @ApiOperation({ summary: 'Transcribe audio file to text' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    async transcribe(@UploadedFile() file: Express.Multer.File) {
        const text = await this.voiceService.transcribe(file);
        return { text };
    }
}
