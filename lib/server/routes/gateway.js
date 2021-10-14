const Router = require('./index');
const errors = require('storj-service-error-types');
const middleware = require('storj-service-middleware');
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

  async updateBucketLimit(req, res, next) {
    try {
      const { Bucket } = this.storage.models;

      const bucket = await Bucket.findOne({ _id: req.params.id });

      if (!bucket) {
        return next(errors.NotFoundError('Bucket not found'));
      }

      bucket.maxFrameSize = req.body.maxFrameSize;

      await bucket.save();

      return res.status(200).send();
    } catch (err) {
      return next(errors.InternalError(err.message));
    }
  }

  _definitions() {
    return [
      ['POST', '/gateway/upgrade', rawbody, this.parseBasicAuth, this.planUpgrade],
      ['POST', '/gateway/uuid', rawbody, this.parseBasicAuth, this.getUuid],
      ['PATCH', '/gateway/bucket/:id', rawbody, this.parseBasicAuth, this.updateBucketLimit]
    ];
  }
}

module.exports = GatewayRouter;
