import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-firebase-jwt';
import * as admin from 'firebase-admin';
import { AuthService } from '../auth.service';

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
    constructor(private readonly authService: AuthService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
    }

    async validate(token: string) {
        if (admin.apps.length === 0) {
            throw new UnauthorizedException('Firebase Admin SDK not initialized. Please ensure FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL are set correctly.');
        }
        try {
            const firebaseUser = await admin.auth().verifyIdToken(token);
            if (!firebaseUser) {
                throw new UnauthorizedException('Invalid Firebase token');
            }

            // Find or create user in our local DB based on Firebase UID/Email
            let user = await this.authService.validateUserById(firebaseUser.uid);

            if (!user && firebaseUser.email) {
                // If user doesn't exist by ID, try email
                user = await this.authService.validateUserByEmail(firebaseUser.email);
            }

            if (!user) {
                // Auto-register user from Firebase if they don't exist
                user = await this.authService.registerFromFirebase(firebaseUser);
            }

            return {
                id: user.id,
                email: user.email,
                roles: user.roles,
                firstName: user.firstName,
                lastName: user.lastName,
            };
        } catch (error) {
            throw new UnauthorizedException(error.message);
        }
    }
}
