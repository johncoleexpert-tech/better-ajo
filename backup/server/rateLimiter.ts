import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes (unref'd to avoid holding serverless event loop)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const { windowMs, maxRequests, message } = options;
  const keyGen = options.keyGenerator || ((req: Request) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    return `${req.baseUrl || ''}${req.path}:${ip}`;
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGen(req);
    const now = Date.now();
    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: message || `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds
      });
    }

    return next();
  };
}
