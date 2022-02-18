#!/usr/bin/env node

'use strict';

const crypto = require('crypto');
const axios = require('axios');

function deleteFile({ bridgeEndpoint, idFile, idBucket, username, password }, cb) {
  const pwdHash = crypto.createHash('sha256').update(password).digest('hex');
  const credential = Buffer.from(`${username}:${pwdHash}`).toString('base64');

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credential}`,
    },
  };
  axios
    .delete(`${bridgeEndpoint}/buckets/${idBucket}/files/${idFile}`, params)
    .then(() => {
      cb();
    })
    .catch(cb);
}

module.exports = {
  deleteFile,
};
