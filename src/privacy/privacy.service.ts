import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class PrivacyService {

  async getPolicy(lang: string) {
    // temporary return (you can connect DB later)
    return {
      language: lang,
      content: 'Privacy policy content here',
    };
  }

  async acceptPolicy(body: any) {
    return {
      message: 'Policy accepted successfully',
      data: body,
    };
  }
}