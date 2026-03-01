import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: 'admin' | 'teacher' | 'student';
    email: string;
    name?: string | null;
  };
}

/**
 * Helper: resolves session via better-auth's API and attaches req.user.
 * Returns true if a valid session was found, false otherwise.
 * Retries once on transient DB / network errors (Neon serverless cold-start).
 */
async function resolveSession(req: AuthRequest): Promise<boolean> {
  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const sessionResult = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (sessionResult?.user) {
        let role = ((sessionResult.user as any).role || 'student') as 'admin' | 'teacher' | 'student';
        // Unapproved teachers are treated as students until verified
        if (role === 'teacher' && !sessionResult.user.emailVerified) {
          role = 'student';
        }
        req.user = {
          id: sessionResult.user.id,
          role,
          email: sessionResult.user.email,
          name: sessionResult.user.name || null,
        };
        return true;
      }
      return false;
    } catch (error) {
      // On last attempt, give up; otherwise retry after a short delay
      if (attempt === maxRetries) {
        console.error(`[AUTH] Session resolution failed after ${maxRetries} attempts:`, error);
        return false;
      }
      console.warn(`[AUTH] Transient error on attempt ${attempt}, retrying...`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

/**
 * Optional auth: sets req.user if session is valid, otherwise leaves req.user undefined.
 * Use before rate-limit middleware so limits can be applied by role.
 */
export async function optionalAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    await resolveSession(req);
  } catch (error) {
    // Silently continue — user stays undefined (guest)
  }
  next();
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const found = await resolveSession(req);

    if (!found) {
      return res.status(401).json({ message: 'Unauthorized - Invalid or expired session' });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Unauthorized - Session verification failed' });
  }
}

export function requireRole(...roles: ('admin' | 'teacher' | 'student')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden - Insufficient permissions' });
    }

    next();
  };
}
