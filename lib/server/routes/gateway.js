const Router = require('./index');
const errors = require('storj-service-error-types');
const middleware = require('storj-service-middleware');
const analytics = require('../../analytics');
const rawbody = middleware.rawbody;

class GatewayRouter extends Router {
  constructor(options) {
    super(options);

    this.secret = this.config.gateway;
  }

  parseBasicAuth(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth) {
      return next(errors.NotAuthorizedError());
    }

    const splitBasic = /^Basic (.*)$/;
    const match = auth.match(splitBasic);
    if (!match || !match[1]) {
      return errors.NotAuthorizedError();
    }

    const bts = Buffer.from(match[1], 'base64').toString();

    const { username, password } = this.secret;

    if (bts !== `${username}:${password}`) {
      return next(errors.NotAuthorizedError());
    }

    next();
  }

  async planUpgrade(req, res, next) {
    const { email, bytes } = req.body;

    if (!email || !bytes || typeof bytes !== 'number') {
      return next(errors.BadRequestError('Invalid data'));
    }

    try {
      const user = await this.storage.models.User.findOne({ _id: email });

      if (!user) {
        console.log('User not found', email);

        return next(errors.BadRequestError('User not found'));
      }

      user.maxSpaceBytes = bytes;
      await user.save();
    } catch {
      return next(errors.InternalError());
    }

    return res.status(200).send();
  }

  async getUuid(req, res, next) {
    try {
      const user = await this.storage.models.User.findOne({ _id: req.body.email });
      if (!user) {
        return next(errors.BadRequestError('User not found'));
      }

      return res.status(200).send({ uuid: user.uuid });
    } catch {
      return next(errors.InternalError());
    }
  }

  async incrementStorage(req, res, next) {
    const { email, bytes } = req.body;

    if (!email || !bytes || typeof bytes !== 'number') {
      return next(errors.BadRequestError('Invalid data'));
    }

    try {
      const user = await this.storage.models.User.findOne({ _id: email });

      if (!user) {
        console.log('User not found', email);

        return next(errors.BadRequestError('User not found'));
      }

      user.maxSpaceBytes += bytes;
      await user.save();
      analytics.identifyReferral(user.uuid, {
        referrals_storage: user.maxSpaceBytes,
        email: req.body.email
      });
    } catch {
      return next(errors.InternalError());
    }

    return res.status(200).json({ message: 'Space added' });
  }

  workerNotifications(req, res, next) {
    console.log('Worker successfully deleted hash: %s', req.body.hash);
    return res.status(200).send();
  }

  _definitions() {
    return [
      ['POST', '/gateway/upgrade', rawbody, this.parseBasicAuth, this.planUpgrade],
      ['POST', '/gateway/uuid', rawbody, this.parseBasicAuth, this.getUuid],
      ['PUT', '/gateway/storage', rawbody, this.parseBasicAuth, this.incrementStorage],
      ['POST', '/gateway/worker/notifications', rawbody, this.parseBasicAuth, this.workerNotifications]
    ];
  }
}

module.exports = GatewayRouter;
