import { MailerConfig, SendGridMailService } from '../../../../lib/core/mail/SendGridMailService';

describe('SendGridMailService', () => {
  const config: MailerConfig = {
    from: 'from@internxt.com',
    sendgrid: {
      api_key: 'api-key',
      sandbox_mode: true,
      delete_template_id: 'delete-template-id',
    },
  };

  const buildClient = () => ({
    setApiKey: jest.fn(),
    send: jest.fn().mockResolvedValue([{}, {}]),
  });

  it('When the usecase is created, then the sendgrid api key is set', () => {
    const client = buildClient();

    new SendGridMailService(config, client);

    expect(client.setApiKey).toHaveBeenCalledWith('api-key');
  });

  describe('sendDeleteUserMail()', () => {
    it('When sending the account deletion email, then it is sent to the user with the deletion template and confirmation link', async () => {
      const client = buildClient();
      const usecase = new SendGridMailService(config, client);

      await usecase.sendDeleteUserMail('user@internxt.com', 'https://drive.internxt.com/deactivations/token');

      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledWith({
        to: 'user@internxt.com',
        from: { email: 'from@internxt.com', name: 'Internxt' },
        subject: '',
        text: 'deactivate acount',
        html: 'deactivate acount',
        personalizations: [
          {
            to: [{ email: 'user@internxt.com' }],
            dynamicTemplateData: {
              email: 'user@internxt.com',
              deletetion_url: 'https://drive.internxt.com/deactivations/token',
            },
          },
        ],
        templateId: 'delete-template-id',
        mailSettings: { sandboxMode: { enable: true } },
      }, false);
    });

    it('When no sender or sandbox mode are configured, then it uses the defaults', async () => {
      const client = buildClient();
      const usecase = new SendGridMailService(
        { sendgrid: { api_key: 'api-key', delete_template_id: 'tpl' } },
        client
      );

      await usecase.sendDeleteUserMail('user@internxt.com', 'redirect');

      const [payload] = client.send.mock.calls[0];
      expect(payload.from).toStrictEqual({ email: 'activate@internxt.com', name: 'Internxt' });
      expect(payload.mailSettings).toStrictEqual({ sandboxMode: { enable: false } });
    });

    it('When sendgrid fails, then the error is propagated', async () => {
      const client = buildClient();
      client.send.mockRejectedValueOnce(new Error('sendgrid down'));
      const usecase = new SendGridMailService(config, client);

      await expect(usecase.sendDeleteUserMail('user@internxt.com', 'redirect'))
        .rejects.toThrow('sendgrid down');
    });
  });
});
