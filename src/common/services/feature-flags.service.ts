import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Flagsmith } from 'flagsmith-nodejs';

@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private flagsmith: Flagsmith;
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private configService: ConfigService) {
    this.flagsmith = new Flagsmith({
      environmentKey: this.configService.get<string>('FLAGSMITH_ENVIRONMENT_KEY') || '',
    });
  }

  async onModuleInit() {
    try {
      // Optional: warm up flagsmith
      await this.flagsmith.getEnvironmentFlags();
      this.logger.log('FeatureFlagsService initialized with Flagsmith');
    } catch (error) {
      this.logger.error(`Failed to connect to Flagsmith: ${error.message}`);
    }
  }

  /**
   * Check if a feature is enabled globally or for a specific user.
   * @param flagKey The feature flag key
   * @param userEmail Optional user email for identity-based flags
   */
  async isFeatureEnabled(flagKey: string, userEmail?: string): Promise<boolean> {
    try {
      if (userEmail) {
        const identityFlags = await this.flagsmith.getIdentityFlags(userEmail);
        return identityFlags.isFeatureEnabled(flagKey);
      }
      const environmentFlags = await this.flagsmith.getEnvironmentFlags();
      return environmentFlags.isFeatureEnabled(flagKey);
    } catch (error) {
      this.logger.error(`Error checking feature flag ${flagKey}: ${error.message}`);
      return false; // Fail-safe to disabled
    }
  }

  /**
   * Get the value of a feature flag.
   * @param flagKey The feature flag key
   * @param userEmail Optional user email for identity-based flags
   */
  async getFeatureValue(flagKey: string, userEmail?: string): Promise<string | number | boolean | null> {
    try {
      if (userEmail) {
        const identityFlags = await this.flagsmith.getIdentityFlags(userEmail);
        return (identityFlags.getFeatureValue(flagKey) as any) ?? null;
      }
      const environmentFlags = await this.flagsmith.getEnvironmentFlags();
      return (environmentFlags.getFeatureValue(flagKey) as any) ?? null;
    } catch (error) {
      this.logger.error(`Error getting feature value for ${flagKey}: ${error.message}`);
      return null;
    }
  }
}
