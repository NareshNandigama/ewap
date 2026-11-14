import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
describe('AuthController', () => {
  it('forwards registration and preserves login/demo routes', async () => {
    const service = { register: vi.fn(), login: vi.fn(), demoLogin: vi.fn() };
    const controller = new AuthController(service as never);
    const dto = {
      organizationName: 'Organization',
      name: 'Owner',
      email: 'owner@example.invalid',
      password: 'password',
    };
    await controller.register(dto);
    await controller.login(dto);
    await controller.demoLogin();
    expect(service.register).toHaveBeenCalledWith(dto);
    expect(service.login).toHaveBeenCalledWith(dto.email, dto.password);
    expect(service.demoLogin).toHaveBeenCalledOnce();
  });
});
