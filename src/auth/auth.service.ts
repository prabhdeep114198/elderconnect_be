import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Device } from './entities/device.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, DeviceRegisterDto } from './dto/login.dto';
import { UserRole, DeviceType } from '../common/enums/user-role.enum';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User, 'auth')
    private readonly userRepository: Repository<User>,
    @InjectRepository(Device, 'auth')
    private readonly deviceRepository: Repository<Device>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ user: Partial<User>; token: string }> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: [
        { email: registerDto.email },
        ...(registerDto.phoneNumber ? [{ phoneNumber: registerDto.phoneNumber }] : []),
      ],
    });

    if (existingUser) {
      throw new ConflictException('User with this email or phone number already exists');
    }

    // Create new user
    const user = this.userRepository.create({
      ...registerDto,
      roles: registerDto.roles || [UserRole.ELDER],
      emailVerificationToken: crypto.randomBytes(32).toString('hex'),
    });

    const savedUser = await this.userRepository.save(user);

    // Generate JWT token
    const token = this.generateToken(savedUser);

    // Remove sensitive information
    const { password, emailVerificationToken, ...userResponse } = savedUser;

    return {
      user: userResponse,
      token,
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string): Promise<{ user: Partial<User>; token: string }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update login information
    user.resetLoginAttempts();
    user.lastLoginIp = ipAddress ?? user.lastLoginIp;
    await this.userRepository.save(user);

    // Generate JWT token
    const token = this.generateToken(user);

    // Remove sensitive information
    const { password, emailVerificationToken, resetPasswordToken, ...userResponse } = user;

    return {
      user: userResponse,
      token,
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      return null;
    }

    if (user.isLocked) {
      throw new UnauthorizedException('Account is locked due to too many failed login attempts');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await user.validatePassword(password);

    if (!isPasswordValid) {
      user.incrementLoginAttempts();
      await this.userRepository.save(user);
      return null;
    }

    return user;
  }

  async validateUserById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
    });
  }

  async registerDevice(userId: string, deviceDto: DeviceRegisterDto): Promise<Device> {
    // Check if device already exists
    const existingDevice = await this.deviceRepository.findOne({
      where: { deviceId: deviceDto.deviceId },
    });

    if (existingDevice) {
      throw new ConflictException('Device with this ID already exists');
    }

    // Validate user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create device
    const device = this.deviceRepository.create({
      ...deviceDto,
      userId,
      type: deviceDto.type as DeviceType,
      certificateFingerprint: crypto.randomBytes(32).toString('hex'),
    });

    return this.deviceRepository.save(device);
  }

  async getDevicesByUser(userId: string): Promise<Device[]> {
    return this.deviceRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async updateDeviceStatus(deviceId: string, isOnline: boolean): Promise<void> {
    const device = await this.deviceRepository.findOne({
      where: { deviceId },
    });

    if (device) {
      if (isOnline) {
        device.updateLastSeen();
      } else {
        device.setOffline();
      }
      await this.deviceRepository.save(device);
    }
  }

  async deactivateDevice(deviceId: string, userId: string): Promise<void> {
    const device = await this.deviceRepository.findOne({
      where: { deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    device.isActive = false;
    await this.deviceRepository.save(device);
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    // read expiresIn from config (may be string or number) and cast to any to satisfy overload typings
    const expiresIn = this.configService.get<string | number | undefined>('jwt.expiresIn');
    return this.jwtService.sign(payload, { expiresIn } as any);
  }

  async refreshToken(userId: string): Promise<string> {
    const user = await this.validateUserById(userId);
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateToken(user);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOldPasswordValid = await user.validatePassword(oldPassword);
    
    if (!isOldPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    user.password = newPassword;
    await this.userRepository.save(user);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (user) {
      user.resetPasswordToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordExpires = new Date(Date.now() + 3600000);
      await this.userRepository.save(user);
      
      // TODO: Send password reset email
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: {
        resetPasswordToken: token,
      },
    });

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.password = newPassword;
    user.resetPasswordToken = "null";
    await this.userRepository.save(user);
  }
}
