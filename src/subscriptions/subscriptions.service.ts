import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { Flagsmith } from 'flagsmith-nodejs';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { User } from '../auth/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { CacheService } from '../common/services/cache.service';

@Injectable()
export class SubscriptionsService {
    private razorpay: any;
    private flagsmith: Flagsmith;
    private readonly logger = new Logger(SubscriptionsService.name);

    constructor(
        @InjectRepository(Subscription, 'auth')
        private subscriptionRepository: Repository<Subscription>,
        @InjectRepository(User, 'auth')
        private userRepository: Repository<User>,
        private configService: ConfigService,
        private cacheService: CacheService,
    ) {
        const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
        const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');

        if (!keyId || !keySecret) {
            this.logger.error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing');
        }

        this.razorpay = new Razorpay({
            key_id: keyId || '',
            key_secret: keySecret || '',
        });

        this.flagsmith = new Flagsmith({
            environmentKey: this.configService.get<string>('FLAGSMITH_ENVIRONMENT_KEY') || '',
        });
    }

    async createOrder(userId: string, createOrderDto: CreateOrderDto) {
        const { amount, currency } = createOrderDto;

        try {
            const options = {
                amount: Math.round(amount * 100), // Razorpay works in paise
                currency: currency,
                receipt: `receipt_${Date.now()}`,
            };

            const order = await this.razorpay.orders.create(options);

            const subscription = this.subscriptionRepository.create({
                userId,
                razorpayOrderId: order.id,
                amount,
                currency,
                status: SubscriptionStatus.PENDING,
            });

            await this.subscriptionRepository.save(subscription);

            return order;
        } catch (error: any) {
            this.logger.error(`Error creating Razorpay order: ${error.message}`);
            throw new BadRequestException('Could not create payment order');
        }
    }

    async getCheckoutHtml(userId: string, amount: number) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new BadRequestException('User not found');

        const order = await this.createOrder(userId, { amount, currency: 'INR' });
        const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');

        // This HTML form will auto-submit or show the Razorpay checkout
        return `
            <!DOCTYPE html>
<html lang="en">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta charset="UTF-8">

    <title>ElderConnect Payment</title>

    <style>
        :root {
            --ios-bg: #f5f5f7;
            --ios-card: #ffffff;
            --ios-text: #1d1d1f;
            --ios-subtext: #6e6e73;
            --ios-blue: #0071e3;
            --ios-radius: 18px;
        }

        * {
            box-sizing: border-box;
            -webkit-font-smoothing: antialiased;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display",
                         "SF Pro Text", Helvetica, Arial, sans-serif;
        }

        body {
            margin: 0;
            background: var(--ios-bg);
            color: var(--ios-text);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            width: 100%;
            max-width: 390px; /* iPhone width */
        }

        .card {
            background: var(--ios-card);
            border-radius: var(--ios-radius);
            padding: 28px 24px;
            box-shadow:
                0 10px 30px rgba(0, 0, 0, 0.08),
                0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .logo {
            display: block;
            margin: 0 auto 16px;
            width: 64px;
            height: 64px;
            border-radius: 16px;
        }

        h1 {
            font-size: 22px;
            font-weight: 600;
            text-align: center;
            margin: 0 0 6px;
        }

        .subtitle {
            text-align: center;
            font-size: 14px;
            color: var(--ios-subtext);
            margin-bottom: 24px;
        }

        .divider {
            height: 1px;
            background: #e5e5ea;
            margin: 20px 0;
        }

        .secure {
            text-align: center;
            font-size: 12px;
            color: var(--ios-subtext);
            margin-top: 16px;
        }

        /* Razorpay button override */
        .razorpay-payment-button {
            width: 100%;
            background: var(--ios-blue) !important;
            color: #fff !important;
            border: none !important;
            border-radius: 14px !important;
            padding: 14px !important;
            font-size: 16px !important;
            font-weight: 600 !important;
            cursor: pointer;
            transition: transform 0.05s ease, box-shadow 0.05s ease;
            box-shadow: 0 6px 14px rgba(0, 113, 227, 0.3);
        }

        .razorpay-payment-button:active {
            transform: scale(0.98);
            box-shadow: 0 3px 8px rgba(0, 113, 227, 0.25);
        }

        .footer-note {
            margin-top: 20px;
            font-size: 11px;
            text-align: center;
            color: var(--ios-subtext);
        }
    </style>
</head>

<body>
    <div class="container">
        <div class="card">

            <img
                src="https://your-logo-url.com/logo.png"
                alt="ElderConnect"
                class="logo"
            >

            <h1>ElderConnect</h1>
            <p class="subtitle">Upgrade your subscription</p>

            <div class="divider"></div>

            <form id="razorpay-form" action="verify-payment-web" method="POST">
                <script
                    src="https://checkout.razorpay.com/v1/checkout.js"
                    data-key="${keyId}"
                    data-amount="${order.amount}"
                    data-currency="${order.currency}"
                    data-order_id="${order.id}"
                    data-buttontext="Continue with Payment"
                    data-name="ElderConnect"
                    data-description="Subscription Upgrade"
                    data-image="https://your-logo-url.com/logo.png"
                    data-prefill.name="${user.firstName} ${user.lastName}"
                    data-prefill.email="${user.email}"
                    data-theme.color="#0071e3"
                ></script>

                <input type="hidden" name="userId" value="${userId}">
            </form>

            <p class="secure">🔒 Secure payment powered by Razorpay</p>
        </div>

        <p class="footer-note">
            By continuing, you agree to our Terms & Privacy Policy
        </p>
    </div>
</body>
</html>

        `;
    }

    async verifyPayment(userId: string, verifyPaymentDto: VerifyPaymentDto) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = verifyPaymentDto;

        const secret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== razorpay_signature) {
            throw new BadRequestException('Invalid payment signature');
        }

        const subscription = await this.subscriptionRepository.findOne({
            where: { razorpayOrderId: razorpay_order_id, userId },
        });

        if (!subscription) {
            throw new BadRequestException('Subscription order not found');
        }

        // Update subscription record
        subscription.razorpayPaymentId = razorpay_payment_id;
        subscription.razorpaySignature = razorpay_signature;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.startDate = new Date();
        subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await this.subscriptionRepository.save(subscription);

        // Update User record
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (user) {
            user.isSubscribed = true;
            user.subscriptionExpiresAt = subscription.endDate;
            await this.userRepository.save(user);

            // Sync with Flagsmith Traits
            await this.syncFlagsmithTraits(user);

            // Invalidate user cache to ensure profile refreshes with latest subscription status
            await this.cacheService.invalidateUserCache(userId);
        }

        return { status: 'success', message: 'Payment verified and subscription activated' };
    }

    async syncFlagsmithTraits(user: User) {
        try {
            const identifier = user.email;
            const traits = {
                is_subscribed: user.isSubscribed,
                subscription_expiry: user.subscriptionExpiresAt?.toISOString() || '',
                user_role: user.roles[0],
            };
            await this.flagsmith.getIdentityFlags(identifier, traits);
            this.logger.log(`Synced Flagsmith traits for user: ${user.email}`);
        } catch (error: any) {
            this.logger.error(`Error syncing with Flagsmith: ${error.message}`);
        }
    }

    async checkSubscriptionStatus(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) return { isSubscribed: false };

        if (user.isSubscribed && user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
            user.isSubscribed = false;
            await this.userRepository.save(user);
            await this.syncFlagsmithTraits(user);
            await this.cacheService.invalidateUserCache(userId);
        }

        return {
            isSubscribed: user.isSubscribed,
            expiresAt: user.subscriptionExpiresAt,
        };
    }

    async getBillingHistory(userId: string) {
        return this.subscriptionRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }
}
