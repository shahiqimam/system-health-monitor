import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../common/enums';
import { User } from '../entities';

export const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.repository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findAll(): Promise<User[]> {
    return this.repository.find({ order: { createdAt: 'ASC' } });
  }

  async create(input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const email = input.email.toLowerCase().trim();
    if (await this.findByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }
    const user = this.repository.create({
      name: input.name,
      email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    });
    return this.repository.save(user);
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    const user = await this.findById(id);
    user.role = role;
    return this.repository.save(user);
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
