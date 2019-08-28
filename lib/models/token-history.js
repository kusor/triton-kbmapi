
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';
var assert = require('assert-plus');

var mod_moray = require('../apis/moray');
var validate = require('../util/validate');

var BUCKET = {
    desc: 'token history',
    name: 'kbmapi_token_history',
    schema: {
        index: {
            guid: { type: 'string' },
            cn_uuid: { type: 'uuid' },
            active_range: { type: 'daterange'}
        }
    },
    version: 0
};

var CREATE_SCHEMA = {
    required: {
        guid: validate.GUID,
        cn_uuid: validate.UUID,
        active_range: validate.isPresent
    }
};

var GET_SCHEMA = {
    required: {
        guid: validate.GUID
    }
};

var DELETE_SCHEMA = {
    required: {
        guid: validate.GUID
    }
};

/**
 * Token model constructor
 */
function Token(params) {
    this.params = {
        guid: params.guid,
        cn_uuid: params.cn_uuid,
        pubkeys: params.pubkeys,
        recovery_tokens: params.recovery_tokens,
        model: params.model,
        serial: params.serial,
        attestation: params.attestation,
        pin: params.pin,
        active_range: params.active_range
    };
}

/**
 * Returns the moray key for storing this Token object
 */
Token.prototype.key = function tokenKey() {
    return this.params.guid;
};

Token.prototype.batch = function tokenBatch() {
    return {
        bucket: BUCKET.name,
        key: this.params.guid,
        operation: 'put',
        value: this.raw(),
        options: {
            etag: this.etag
        }
    };
};

Token.prototype.serialize = function tokenSerialize() {
    return {
        guid: this.params.guid,
        cn_uuid: this.params.cn_uuid,
        pubkeys: this.params.pubkeys,
        recovery_tokens: this.params.recovery_tokens,
        model: this.params.model,
        serial: this.params.serial,
        attestation: this.params.attestation,
        pin: this.params.pin
    };
};

Token.prototype.raw = function tokenRaw() {
    var self = this;
    return (Object.assign(self.serialize(), {v: BUCKET.version}));
};

function createToken(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.params, 'opts.params');
    assert.func(callback, 'callback');

    opts.log.debug({ params: opts.params }, 'createToken: history entry');
    if (!opts.params.active_range && opts.params.created) {
        opts.params.active_range =
            [opts.params.created, new Date().toISOString()];
        delete opts.params.created;
    }


    function createTokenCb(err) {
        if (err) {
            callback(err);
            return;
        }

        var token = new Token(opts.params);

        mod_moray.putObj(opts.moray, BUCKET, token,
            function morayPutTokenCb(pErr) {
            if (pErr) {
                callback(pErr);
                return;
            }

            callback(null, token);
        });
    }

    validate.params(CREATE_SCHEMA, null, opts.params, createTokenCb);
}


function getToken(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.params, 'opts.params');
    assert.func(callback, 'callback');

    opts.log.debug(opts.params, 'getToken: history entry');

    validate.params(GET_SCHEMA, null, opts.params,
        function getTokenValidateCb(err) {
        if (err) {
            callback(err);
            return;
        }

        mod_moray.getObj(opts.moray, BUCKET, opts.params.guid,
            function getTokenMorayCb(mErr, token) {
                if (mErr) {
                    callback(mErr);
                    return;
                }

                var tokenObj = new Token(token.value);

                callback(null, tokenObj);
        });
    });
}


function deleteToken(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.params, 'opts.params');
    assert.func(callback, 'callback');

    opts.log.debug(opts.params, 'deleteToken: history entry');

    function deleteTokenCb(err) {
        if (err) {
            callback(err);
            return;
        }

        opts.moray.delObject(BUCKET.name, opts.params.guid, callback);
    }

    validate.params(DELETE_SCHEMA, null, opts.params, deleteTokenCb);
}

function initTokenHistoryBucket(moray, cb) {
    mod_moray.initBucket(moray, BUCKET, cb);
}

module.exports = {
    bucket: function () { return BUCKET; },
    create: createToken,
    del: deleteToken,
    Token: Token,
    get: getToken,
    init: initTokenHistoryBucket
};

// vim: set softtabstop=4 shiftwidth=4:
