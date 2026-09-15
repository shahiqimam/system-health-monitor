import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CreateUserDto, UpdateUserRoleDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

const toPublicUser = (user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (ADMIN)' })
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(toPublicUser);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user (ADMIN)' })
  async create(@Body() dto: CreateUserDto) {
    return toPublicUser(await this.usersService.create(dto));
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a user role (ADMIN)' })
  async updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserRoleDto) {
    return toPublicUser(await this.usersService.updateRole(id, dto.role));
  }
}
