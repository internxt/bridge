export interface Mailer {
  dispatchSendGrid: (
    email: string, 
    type: 'delete' | 'reset', 
    params: {
      token: string;
      redirect: string;
      url: string;
    }, 
    cb: (err?: Error) => void
  ) => void;
}

export interface MailUsecase {
  sendDeleteUserMail: (sendTo: string, token: string, redirect: string) => Promise<void>;
  sendResetPasswordMail: (sendTo: string, token: string, redirect: string, url?: string) => Promise<void>
}

export interface Profile {
  host: string;
  port?: number;
  protocol: 'https:' | 'http:'
}

export class SendGridMailUsecase implements MailUsecase {
  constructor(
    private mailer: Mailer,
    private profile: Profile
  ) {}

  async sendDeleteUserMail(sendTo: string, token: string, redirect: string): Promise<void> {
    const { protocol, host, port } = this.profile;

    await new Promise((resolve, reject) => {
      this.mailer.dispatchSendGrid(sendTo, 'delete', {
        token,
        redirect,
        url: protocol + '//' + host + (port ? `:${port}` : '')
      }, (err) => {
        if (err) { reject(err) } else resolve(null);
      });
    })
  }

  async sendResetPasswordMail(sendTo: string, token: string, redirect: string, url?: string | undefined): Promise<void> {
    const { protocol, host, port } = this.profile;

    await new Promise((resolve, reject) => {
      this.mailer.dispatchSendGrid(sendTo, 'reset', {
        token,
        redirect,
        url: url || protocol + '//' + host + (port ? `:${port}` : '')
      }, (err) => {
        if (err) { reject(err) } else resolve(null);
      });
    });
  }
}
