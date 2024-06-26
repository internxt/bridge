export interface Contact {
  id: string;
  address: string;
  ip: string | null;
  port: number;
  protocol: string;
  reputation: number;
  responseTime: number;
  spaceAvailable: boolean;
  userAgent?: string;
  lastSeen: Date;
  lastTimeout?: Date;
  timeoutRate?: number;
  objectCheckNotRequired?: boolean;
}
