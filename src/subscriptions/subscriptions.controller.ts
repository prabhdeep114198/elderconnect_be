import { Controller, Post, Get, Body, UseGuards, Query, Header, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as express from 'express';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) { }

    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @Post('create-order')
    @ApiOperation({ summary: 'Create a Razorpay order' })
    async createOrder(@CurrentUser() user, @Body() createOrderDto: CreateOrderDto) {
        return this.subscriptionsService.createOrder(user.id, createOrderDto);
    }

    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @Get('checkout-html')
    @Header('Content-Type', 'text/html')
    @ApiOperation({ summary: 'Get Razorpay checkout HTML form' })
    async getCheckoutHtml(@CurrentUser() user, @Query('amount') amount: number) {
        return this.subscriptionsService.getCheckoutHtml(user.id, amount);
    }

    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @Post('verify-payment')
    @ApiOperation({ summary: 'Verify Razorpay payment signature' })
    async verifyPayment(@CurrentUser() user, @Body() verifyPaymentDto: VerifyPaymentDto) {
        return this.subscriptionsService.verifyPayment(user.id, verifyPaymentDto);
    }

    // Webhook or Form Post for Web-based checkout
    @Post('verify-payment-web')
    @ApiOperation({ summary: 'Verify Razorpay payment from web form' })
    async verifyPaymentWeb(@Body() body: any, @Res() res: express.Response) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = body;

        try {
            await this.subscriptionsService.verifyPayment(userId, {
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            });
            // Redirect or send simple success HTML
            res.send(`
                <html>
                    <body>
                        <h1>Payment Successful</h1>
                        <p>You can now close this window.</p>
                        <script>
                            setTimeout(() => {
                                window.location.href = "success"; 
                            }, 2000);
                        </script>
                    </body>
                </html>
            `);
        } catch (error: any) {
            res.status(400).send(`
                <html>
                    <body>
                        <h1>Payment Verification Failed</h1>
                        <p>${error.message}</p>
                    </body>
                </html>
            `);
        }
    }

    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @Get('status')
    @ApiOperation({ summary: 'Check current user subscription status' })
    async getStatus(@CurrentUser() user) {
        return this.subscriptionsService.checkSubscriptionStatus(user.id);
    }

    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @Get('billing-history')
    @ApiOperation({ summary: 'Get user billing history' })
    async getBillingHistory(@CurrentUser() user) {
        return this.subscriptionsService.getBillingHistory(user.id);
    }
}
