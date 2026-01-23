import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseAdminService } from './firebase-admin.service';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [FirebaseAdminService],
    exports: [FirebaseAdminService],
})
export class FirebaseAdminModule { }
