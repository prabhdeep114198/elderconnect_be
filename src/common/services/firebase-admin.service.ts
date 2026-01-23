import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
    private readonly logger = new Logger(FirebaseAdminService.name);

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        this.initializeFirebase();
    }

    private initializeFirebase(): void {
        if (admin.apps.length > 0) {
            return;
        }

        try {
            const projectId = this.configService.get<string>('firebase.projectId');
            const privateKey = this.configService.get<string>('firebase.privateKey');
            const clientEmail = this.configService.get<string>('firebase.clientEmail');

            if (!projectId || !privateKey || !clientEmail) {
                this.logger.warn('Firebase credentials not fully configured. Firebase features will be disabled.');
                return;
            }

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    privateKey,
                    clientEmail,
                }),
                projectId,
            });

            this.logger.log('Firebase Admin SDK initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Firebase Admin SDK:', error);
        }
    }

    getAdmin(): typeof admin {
        return admin;
    }
}
