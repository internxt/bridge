import sendGridMail, { MailService as SendGridClient } from '@sendgrid/mail';

export interface MailerConfig {
  from?: string;
  sendgrid: {
    api_key: string;
    sandbox_mode?: boolean;
    delete_template_id: string;
  };
}

export interface MailService {
  sendDeleteUserMail: (sendTo: string, redirect: string) => Promise<void>;
}

const DEFAULT_FROM = 'activate@internxt.com';

export class SendGridMailService implements MailService {
  constructor(
    private config: MailerConfig,
    private client: Pick<SendGridClient, 'setApiKey' | 'send'> = sendGridMail
  ) {
    this.client.setApiKey(config.sendgrid.api_key);
  }

  async sendDeleteUserMail(sendTo: string, redirect: string): Promise<void> {
    const { from, sendgrid } = this.config;

    await this.client.send({
      to: sendTo,
      from: {
        email: from || DEFAULT_FROM,
        name: 'Internxt',
      },
      subject: '',
      text: 'deactivate acount',
      html: 'deactivate acount',
      personalizations: [
        {
          to: [{ email: sendTo }],
          dynamicTemplateData: {
            email: sendTo,
            deletetion_url: redirect,
          },
        },
      ],
      templateId: sendgrid.delete_template_id,
      mailSettings: {
        sandboxMode: {
          enable: sendgrid.sandbox_mode || false,
        },
      },
    }, false);
  }
}
