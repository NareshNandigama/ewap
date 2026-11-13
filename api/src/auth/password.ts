import { BadRequestException } from '@nestjs/common';
import bcrypt from 'bcrypt';

export async function hashAccountPassword(password: string): Promise<string> {
  // bcrypt considers at most 72 bytes, not 72 Unicode characters. Reject rather
  // than silently accepting passwords which differ only after that boundary.
  if (
    typeof password !== 'string' ||
    [...password].length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new BadRequestException(
      'Password must contain at least 8 characters and at most 72 UTF-8 bytes',
    );
  }
  return bcrypt.hash(password, 12);
}
