const Router = require('./index');
const errors = require('storj-service-error-types');
const middleware = require('storj-service-middleware');
const jwt = require('jsonwebtoken');
const analytics = require('../../analytics');
const logger = require('../../logger');
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

  jwtVerify(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth) {
      return next(errors.NotAuthorizedError());
    }

    const token = auth && auth.split('Bearer ')[1];

    if (token === null) {
      return next(errors.BadRequestError());
    }

    jwt.verify(token, this.config.JWT_SECRET, (err, payload) => {
      if (err) {
        logger.info(
          'Error authenticating JWT (%s) token: %s',
          err.message,
          token
        );

        return next(errors.ForbiddenError());
      }

      req.payload = payload;

      next();
    });
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
    const { email } = req.body;
    const bytes = parseInt(req.body.bytes);

    if (!email || !bytes || typeof bytes !== 'number') {
      return next(errors.BadRequestError('Invalid data'));
    }

    try {
      const user = await this.storage.models.User.findOne({ _id: email });

      if (!user) {
        console.log('User not found', email);

        return next(errors.NotFoundError('User not found'));
      }

      user.maxSpaceBytes += bytes;
      await user.save();
    } catch (err) {
      logger.error(`Error incrementing storage by email: ${err.message}`);

      return next(errors.InternalError());
    }

    return res.status(200).json({ message: 'Space added' });
  }

  async incrementStorageByUUID(req, res, next) {
    const { uuid } = req.body;
    const bytes = parseInt(req.body.bytes);

    if (!uuid || !bytes || typeof bytes !== 'number') {
      return next(errors.BadRequestError('Invalid data'));
    }

    try {
      const user = await this.storage.models.User.findOne({ uuid });

      if (!user) {
        console.log('User not found', uuid);

        return next(errors.NotFoundError('User not found'));
      }

      user.maxSpaceBytes += bytes;
      await user.save();
    } catch (err) {
      logger.error(`Error incrementing storage by uuid: ${err.message}`);

      return next(errors.InternalError());
    }

    return res.status(200).json({ message: 'Space added' });
  }

  workerNotifications(req, res) {
    logger.info('Worker successfully deleted hash %s', req.body.hash);

    return res.status(200).json({ message: 'Worker message logged' });
  }

  _definitions() {
    return [
      ['POST', '/gateway/upgrade', rawbody, this.parseBasicAuth, this.planUpgrade],
      ['POST', '/gateway/uuid', rawbody, this.parseBasicAuth, this.getUuid],
      ['PUT', '/gateway/storage', rawbody, this.parseBasicAuth, this.incrementStorage],
      ['PUT', '/gateway/increment-storage-by-uuid', rawbody, this.parseBasicAuth, this.incrementStorageByUUID],
      ['POST', '/gateway/worker/notifications', rawbody, this.jwtVerify, this.workerNotifications]
    ];
  }
}

module.exports = GatewayRouter;
