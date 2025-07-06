import { NextApiRequest } from 'next';

export interface SecurityEvent {
  type: 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'PASSKEY_REGISTER' | 'PASSKEY_DELETE' | 'RATE_LIMIT_EXCEEDED' | 'SUSPICIOUS_ACTIVITY';
  userId?: string;
  userEmail?: string;
  clientIP: string;
  userAgent: string;
  timestamp: string;
  details: Record<string, any>;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source: string;
}

class SecurityLogger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private extractClientInfo(req: NextApiRequest) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIP = forwarded 
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
      : req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
    
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    return { clientIP, userAgent };
  }

  private async logToStorage(event: SecurityEvent) {
    try {
      // In production, you might want to use a dedicated logging service
      // like DataDog, Splunk, or a dedicated security SIEM
      
      if (this.isDevelopment) {
        console.log('🔒 SECURITY EVENT:', JSON.stringify(event, null, 2));
      } else {
        // Production logging - could be:
        // - Database table for security events
        // - External logging service
        // - File-based logging with log rotation
        console.log('SECURITY_EVENT', JSON.stringify(event));
      }

      // Optional: Store critical events in database
      if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
        await this.storeInDatabase(event);
      }
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  private async storeInDatabase(event: SecurityEvent) {
    try {
      // You could create a SecurityLog table in your database
      // const { prisma } = await import('./prisma');
      // await prisma.securityLog.create({
      //   data: {
      //     type: event.type,
      //     userId: event.userId,
      //     clientIP: event.clientIP,
      //     userAgent: event.userAgent,
      //     details: event.details,
      //     severity: event.severity,
      //     source: event.source,
      //     timestamp: new Date(event.timestamp)
      //   }
      // });
    } catch (error) {
      console.error('Failed to store security event in database:', error);
    }
  }

  async logPasskeyRegistration(req: NextApiRequest, userId: string, success: boolean, details: any = {}) {
    const { clientIP, userAgent } = this.extractClientInfo(req);
    
    const event: SecurityEvent = {
      type: 'PASSKEY_REGISTER',
      userId,
      clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: success ? 'LOW' : 'MEDIUM',
      source: 'webauthn',
      details: {
        success,
        credentialType: details.credentialType || 'unknown',
        authenticatorAttachment: details.authenticatorAttachment,
        ...details
      }
    };

    await this.logToStorage(event);
  }

  async logPasskeyAuthentication(req: NextApiRequest, success: boolean, userId?: string, details: any = {}) {
    const { clientIP, userAgent } = this.extractClientInfo(req);
    
    const event: SecurityEvent = {
      type: success ? 'AUTH_SUCCESS' : 'AUTH_FAILURE',
      userId,
      clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: success ? 'LOW' : 'MEDIUM',
      source: 'webauthn',
      details: {
        method: 'passkey',
        ...details
      }
    };

    await this.logToStorage(event);
  }

  async logPasskeyDeletion(req: NextApiRequest, userId: string, passkeyId: string) {
    const { clientIP, userAgent } = this.extractClientInfo(req);
    
    const event: SecurityEvent = {
      type: 'PASSKEY_DELETE',
      userId,
      clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM',
      source: 'webauthn',
      details: {
        passkeyId,
        action: 'delete_passkey'
      }
    };

    await this.logToStorage(event);
  }

  async logRateLimitExceeded(req: NextApiRequest, endpoint: string, limit: number) {
    const { clientIP, userAgent } = this.extractClientInfo(req);
    
    const event: SecurityEvent = {
      type: 'RATE_LIMIT_EXCEEDED',
      clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM',
      source: 'rate_limiter',
      details: {
        endpoint,
        limit,
        action: 'rate_limit_exceeded'
      }
    };

    await this.logToStorage(event);
  }

  async logSuspiciousActivity(req: NextApiRequest, reason: string, details: any = {}) {
    const { clientIP, userAgent } = this.extractClientInfo(req);
    
    const event: SecurityEvent = {
      type: 'SUSPICIOUS_ACTIVITY',
      clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: 'HIGH',
      source: 'security_monitor',
      details: {
        reason,
        ...details
      }
    };

    await this.logToStorage(event);
  }

  async logMultipleFailedAttempts(req: NextApiRequest, attemptCount: number, userId?: string) {
    const { clientIP, userAgent } = this.extractClientInfo(req);
    
    const event: SecurityEvent = {
      type: 'SUSPICIOUS_ACTIVITY',
      userId,
      clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: attemptCount > 5 ? 'HIGH' : 'MEDIUM',
      source: 'auth_monitor',
      details: {
        reason: 'multiple_failed_attempts',
        attemptCount,
        timeWindow: '15_minutes'
      }
    };

    await this.logToStorage(event);
  }

  // Security metrics and alerting
  async generateSecurityReport(timeframe: 'hour' | 'day' | 'week' = 'day') {
    // This would typically query your logging storage
    // and generate security metrics and alerts
    return {
      timeframe,
      timestamp: new Date().toISOString(),
      metrics: {
        totalEvents: 0,
        authSuccesses: 0,
        authFailures: 0,
        rateLimitHits: 0,
        suspiciousActivities: 0
      },
      topIPs: [],
      alerts: []
    };
  }
}

export const securityLogger = new SecurityLogger(); 