import { Controller, Get, Query, Post, Body } from "@nestjs/common";
import { PrivacyService } from "./privacy.service";

@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  // GET /privacy?lang=en
  @Get()
  getPolicy(@Query("lang") lang: string) {
    return this.privacyService.getPolicy(lang || "en");
  }

  // POST /privacy/accept
  @Post("accept")
  acceptPolicy(@Body() body) {
    return this.privacyService.acceptPolicy(body);
  }
}