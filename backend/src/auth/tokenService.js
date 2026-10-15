const crypto = require('crypto');

// JWT choice: built-in Node crypto HMAC-SHA256, NO external JWT library.
// Rationale (from task decisions): refresh tokens are already stored hashed in
// auth_session, access tokens are short-lived and stateless, and the project
// already mandates Node crypto (scrypt). Tokens are compact JWS (HS256):
// base64url(header).base64url(payload).base64url(signature). Payload carries
// {sub, role, type, iat, exp, jti}; verify checks the signature with
// timingSafeEqual and the exp claim.

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

class TokenService {
  /**
   * @param {{secret: string, accessTtlSec?: number, refreshTtlSec?: number, clock?: () => Date}} deps
   */
  constructor({ secret, accessTtlSec = 900, refreshTtlSec = 604800, clock } = {}) {
    if (!secret) {
      throw new Error('TokenService requires a signing secret (JWT_SECRET).');
    }
    this.secret = secret;
    this.accessTtlSec = accessTtlSec;
    this.refreshTtlSec = refreshTtlSec;
    this.clock = clock || (() => new Date());
  }

  _nowSec() {
    return Math.floor(this.clock().getTime() / 1000);
  }

  _sign(signingInput) {
    return base64UrlEncode(
      crypto.createHmac('sha256', this.secret).update(signingInput).digest(),
    );
  }

  /**
   * Build a signed token.
   * @param {{sub: (string|number), role: string, type: 'access'|'refresh', ttlSec?: number, jti?: string}} claims
   */
  sign({ sub, role, type, ttlSec, jti } = {}) {
    const iat = this._nowSec();
    const ttl = ttlSec != null
      ? ttlSec
      : (type === 'refresh' ? this.refreshTtlSec : this.accessTtlSec);
    const payload = {
      sub,
      role,
      type,
      iat,
      exp: iat + ttl,
      jti: jti || randomToken(16),
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = this._sign(signingInput);
    return { token: `${signingInput}.${signature}`, payload };
  }

  signAccess({ sub, role, jti } = {}) {
    return this.sign({ sub, role, type: 'access', jti });
  }

  signRefresh({ sub, role, jti } = {}) {
    return this.sign({ sub, role, type: 'refresh', jti });
  }

  /**
   * Verify a token's signature and expiry. Throws a 401 error on any failure.
   * @param {string} token
   * @param {{type?: 'access'|'refresh'}} [options] optional expected token type
   * @returns {object} decoded payload
   */
  verify(token, { type } = {}) {
    const fail = (message) => {
      const err = new Error(message);
      err.statusCode = 401;
      err.code = 'UNAUTHORIZED';
      return err;
    };
    if (typeof token !== 'string') throw fail('Invalid token.');
    const segments = token.split('.');
    if (segments.length !== 3) throw fail('Invalid token.');
    const [encodedHeader, encodedPayload, signature] = segments;
    const expectedSig = this._sign(`${encodedHeader}.${encodedPayload}`);
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length
      || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw fail('Invalid token signature.');
    }
    let payload;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    } catch {
      throw fail('Invalid token.');
    }
    if (payload.exp != null && this._nowSec() >= payload.exp) {
      throw fail('Token expired.');
    }
    if (type && payload.type !== type) {
      throw fail('Unexpected token type.');
    }
    return payload;
  }
}

module.exports = { TokenService, sha256, randomToken };
