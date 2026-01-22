import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, DeviceRegisterDto } from './dto/login.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('Authentication')
@Controller('v1/auth')
@UseInterceptors(AuditLogInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async register(@Body() registerDto: RegisterDto, @Request() req) {
    const result = await this.authService.register(registerDto);
    return {
      message: 'User registered successfully',
      data: result,
    };
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(@Body() loginDto: LoginDto, @Request() req) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await this.authService.login(loginDto, ipAddress);

    return {
      message: 'Login successful',
      data: result,
    };
  }

  @Post('firebase-login')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or sync user with Firebase token' })
  @ApiResponse({ status: 200, description: 'Firebase user successfully authenticated' })
  async firebaseLogin(@CurrentUser() user) {
    // The FirebaseAuthGuard already validated the token and 
    // attached the local user record (or created one) to the request.
    // We return a local JWT token for subsequent API calls.
    const result = await this.authService.refreshToken(user.id);

    return {
      message: 'Firebase login successful',
      data: {
        user,
        token: result,
      },
    };
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refreshToken(@CurrentUser() user) {
    const token = await this.authService.refreshToken(user.id);

    return {
      message: 'Token refreshed successfully',
      data: { token },
    };
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user) {
    return {
      message: 'Profile retrieved successfully',
      data: { user },
    };
  }

  @Post('devices/register')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new device' })
  @ApiResponse({ status: 201, description: 'Device registered successfully' })
  @ApiResponse({ status: 409, description: 'Device already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async registerDevice(
    @CurrentUser() user,
    @Body() deviceDto: DeviceRegisterDto,
  ) {
    const device = await this.authService.registerDevice(user.id, deviceDto);

    return {
      message: 'Device registered successfully',
      data: { device },
    };
  }

  @Get('devices')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user devices' })
  @ApiResponse({ status: 200, description: 'Devices retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDevices(@CurrentUser() user) {
    const devices = await this.authService.getDevicesByUser(user.id);

    return {
      message: 'Devices retrieved successfully',
      data: { devices },
    };
  }

  @Delete('devices/:deviceId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a device' })
  @ApiResponse({ status: 204, description: 'Device deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deactivateDevice(
    @CurrentUser() user,
    @Param('deviceId') deviceId: string,
  ) {
    await this.authService.deactivateDevice(deviceId, user.id);

    return {
      message: 'Device deactivated successfully',
    };
  }

  @Patch('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePassword(
    @CurrentUser() user,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    await this.authService.changePassword(
      user.id,
      body.oldPassword,
      body.newPassword,
    );

    return {
      message: 'Password changed successfully',
    };
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.requestPasswordReset(body.email);

    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(
    @Body() body: { token: string; newPassword: string },
  ) {
    await this.authService.resetPassword(body.token, body.newPassword);

    return {
      message: 'Password reset successfully',
    };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(@CurrentUser() user) {
    // In a real implementation, you might want to blacklist the token
    // or update the user's last logout time

    return {
      message: 'Logged out successfully',
    };
  }
}
