import { ConfigService } from '@nestjs/config';
import { AppConfig, loadConfig } from '../../config/configuration';
import { BlockedTargetError } from './blocked-target.error';
import { UrlValidatorService } from './url-validator.service';

const buildService = (allowPrivateTargets: boolean): UrlValidatorService => {
  const config = loadConfig();
  config.ssrf.allowPrivateTargets = allowPrivateTargets;
  const configService = {
    get: (key: keyof AppConfig) => config[key],
  } as unknown as ConfigService<AppConfig, true>;
  return new UrlValidatorService(configService);
};

describe('UrlValidatorService', () => {
  const service = buildService(false);

  describe('syntax policy', () => {
    it.each(['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com', 'data:text/plain,x'])(
      'rejects the %s scheme',
      (url) => {
        expect(() => service.parseAndValidateSyntax(url)).toThrow(BlockedTargetError);
      },
    );

    it('rejects javascript: URLs', () => {
      expect(() => service.parseAndValidateSyntax('javascript:alert(1)')).toThrow(
        BlockedTargetError,
      );
    });

    it('rejects URLs carrying credentials', () => {
      expect(() => service.parseAndValidateSyntax('https://user:pass@example.com/health')).toThrow(
        /must not contain credentials/,
      );
    });

    it('rejects a non-absolute URL', () => {
      expect(() => service.parseAndValidateSyntax('/health')).toThrow(BlockedTargetError);
    });

    it('rejects an over-long URL', () => {
      const long = `https://example.com/${'a'.repeat(3000)}`;
      expect(() => service.parseAndValidateSyntax(long)).toThrow(/exceeds/);
    });

    it('accepts http and https', () => {
      expect(service.parseAndValidateSyntax('http://example.com/health').protocol).toBe('http:');
      expect(service.parseAndValidateSyntax('https://example.com/health').protocol).toBe('https:');
    });
  });

  describe('address policy (ALLOW_PRIVATE_TARGETS=false)', () => {
    it.each([
      ['127.0.0.1', 'loopback'],
      ['10.1.2.3', 'private'],
      ['172.16.0.9', 'private'],
      ['192.168.1.4', 'private'],
      ['169.254.169.254', 'link-local / cloud metadata'],
      ['0.0.0.0', 'this network'],
      ['224.0.0.1', 'multicast'],
      ['::1', 'IPv6 loopback'],
      ['fd00::1', 'IPv6 unique-local'],
      ['fe80::1', 'IPv6 link-local'],
      ['::ffff:169.254.169.254', 'IPv4-mapped metadata address'],
    ])('blocks %s (%s)', (address) => {
      expect(() => service.assertAddressAllowed(address, 'target.invalid')).toThrow(
        BlockedTargetError,
      );
    });

    it('allows a public unicast address', () => {
      expect(() => service.assertAddressAllowed('93.184.216.34', 'example.com')).not.toThrow();
    });

    it('blocks a literal private IP target end to end', async () => {
      const url = service.parseAndValidateSyntax('http://169.254.169.254/latest/meta-data/');
      await expect(service.assertDestinationAllowed(url)).rejects.toThrow(BlockedTargetError);
    });
  });

  describe('local lab override (ALLOW_PRIVATE_TARGETS=true)', () => {
    const permissive = buildService(true);

    it('allows loopback destinations', async () => {
      const url = permissive.parseAndValidateSyntax('http://127.0.0.1:8080/health');
      await expect(permissive.assertDestinationAllowed(url)).resolves.toBeDefined();
    });

    it('still rejects unsafe schemes and credentials', () => {
      expect(() => permissive.parseAndValidateSyntax('file:///etc/passwd')).toThrow(
        BlockedTargetError,
      );
      expect(() => permissive.parseAndValidateSyntax('http://a:b@127.0.0.1/')).toThrow(
        BlockedTargetError,
      );
    });
  });
});
