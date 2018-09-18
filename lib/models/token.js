/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

'use strict';

// XXX At some point, we need something to filter out any sensitive values
// in params (e.g. token pin) so that such things do not end up in the logs

var mod_moray = require('../apis/moray');
var validate = require('../util/validate.js');

// The assumption is that a token can only be associated with a single server
// however it seems possible (at least for now) that there might be multiple
// tokens on a given server.
var BUCKET = {
    desc: 'piv tokens',
    name: 'kbmapi_piv_token',
    schema: {
        index: {
            guid: { type: 'string', unique: true },
            cn_uuid: { type: 'uuid' },
            serial: { type: 'string', unique: true }
        }
    },
    version: 0
};

// Names that are allowed to be used in the fields filter
var VALID_FIELDS = [
    'guid',
    'cn_uuid',
    'serial',
    'model',
    'attestation'
];

var CREATE_SCHEMA = {
    required: {
        guid: validate.GUID,
        cn_uuid: validate.UUID,
        serial: validate.string, // XXX Or are these guaranteed to be a number?
        model: validate.string // XXX Could this be optional?
    }
};

var DELETE_SCHEMA = {
    required: {
        guid: validate.GUID
    }
};

var LIST_SCHEMA = {
    required: {
        guid: validate.GUID
    },
    optional: {
        fields: validate.fieldsArray(VALID_FIELDS),
        offset: validate.offset,
        limit: validate.limit
    }
};

var UPDATE_SCHEMA = {
    required: {
        guid: validate.GUID
    }
};

/**
 * Token model constructor
 */
function Token(params) {
    this.params = {
        guid: params.name,
        cn_uuid: params.cn_uuid,
        pubkeys: params.pubkeys,
        recovery_token: params.recovery_token,
        model: params.model,
        serial: params.serial,
        attestation: params.attestation,
        pin: params.pin
    };
}

// XXX I'm assuming both of these should be read-only after creation
Object.defineProperty(Token.prototype, 'guid', {
    get: function getGuid() { return this.params.guid; }
});

Object.defineProperty(Token.prototype, 'serial', {
    get: function getSerial() { return this.params.serial; }
});

/**
 * Returns the moray key for storing this Token object
 */
Token.prototype.key = function tokenKey() {
    return this.name;
};

Token.prototype.batch = function tokenBatch() {
    return {
        bucket: BUCKET.name,
        key: this.name,
        operation: 'put',
        value: this.raw(),
        options: {
            etag: this.etag
        }
    };
};

Token.prototype.delBatch = function tokenDelBatch() {
    var batchObj = {
        bucket: BUCKET.name,
        key: this.name,
        operation: 'delete'
    };

    if (this.params.oldname) {
        batchObj.key = this.params.oldname;
    }

    return batchObj;
};

Token.prototype.raw = function tokenRaw() {
    return {
        guid: this.params.guid,
        cn_uuid: this.params.cn_uuid,
        pubkeys: this.params.pubkeys,
        recovery_token: this.params.recovery_token,
        model: this.params.model,
        serial: this.params.serial,
        attestation: this.params.attestation,
        pin: this.params.pin,
        v: BUCKET.version
    };
};

Token.prototype.serialize = function tokenSerialize() {
    return {
        guid: this.params.guid,
        cn_uuid: this.params.cn_uuid,
        pubkeys: this.params.pubkeys,
        recovery_token: this.params.recovery_token,
        model: this.params.model,
        serial: this.params.serial,
        attestation: this.params.attestation,
        pin: this.params.pin
    };
};

function createToken(app, log, params, callback) {
    log.debug({ params: params }, 'createToken: entry');

    var copts = {
        app: app,
        log: log
    };

    validate.params(CREATE_SCHEMA, copts, params,
        function validateCreateTokenCb(err) {
        if (err) {
            callback(err);
            return;
        }

        var token = new Token(params);
        mod_moray.putObj(app.moray, BUCKET, tag,
            function morayPutTokenCb(pErr) {
            if (pErr) {
                callback(pErr);
                return;
            }

            callback(null, tag);
        });
    });
}

function deleteToken(app, log, params, callback) {
    log.debug(params, 'deleteToken: entry');

    var dopts = {
        app: app,
        log: log
    };

    validate.params(DELETE_SCHEMA, dopts, params, function deleteTokenCb(err) {
        if (err) {
            callback(err);
            return;
        }

        app.moray.delObject(BUCKET.name, params.name, callback);
    });
}

function listTokens(app, log, params, callback) {
    log.debug({ params: oparams }, 'listTokens: entry');

    validate.params(LIST_SCHEMA, null, oparams,
        function listTokensValidateCb(err, validated) {
            if (err) {
                callback(err);
                return;
            }

            var lim, off;

            if (validated.hasOwnProperty('limit')) {
                lim = validated.limit;
                delete validated.limit;
            }

            if (validated.hasOwnProperty('offset')) {
                off = validated.offset;
                delete validated.offset;
            }

            mod_moray.listObjs({
                defaultFilter: fmt('()'),
                filter: validated,
                limit: lim,
                log: log,
                offset: off,
                bucket: BUCKET,
                model: Token,
                moray: app.moray,
                sort: {
                    attribute: 'guid',
                    order: 'ASC'
                }
            }, function listTokensMorayCb(mErr, tokens) {
                if (mErr) {
                    callback(mErr);
                    return;
                }

                tokens.forEach(function stripPin(token) {
                    delete token.pin;
                });

                callback(null, tokens);
            });
        });
}

function _getTokenImpl(app, log, params, removePin, callback)
{
    validate.params(GET_SCHEMA, null, params, function getTokenValidateCb(err) {
        if (err) {
            callback(err);
            return;
        }

        mod_moray.getObj(app.moray, BUCKET, params.name,
            function getTokenMorayCb(mErr, token) {
                if (mErr) {
                    callback(mErr);
                    return;
                }

                // Cheesy, but for the prototype just delete the pin unless
                // GET /pivtoken/:guid/pin has been called
                tokenObj = new Token(token.value);
                if (removePin) {
                    delete tokenObj.pin;
                }

                callback(null, tokenObj);
                return;
            });
    });
}

function getToken(app, log, params, callback) {
    log.debug(params, 'getToken: entry');
    _getTokenImpl(app, log, params, true, callback);
}

function getTokenPin(app, log, params, callback) {
    log.debug(params, 'getTokenPin: entry');
    _getTokenImpl(app, log, params, false, callback);
}

function initTokenBucket(app, cb) {
    mod_moray.initBucket(app.moray, BUCKET, cb);
}

function updateToken(app, log, params, callback) {
    log.debug(params, 'updateToken: entry');
    var validatedParams;

    var opts = {
        app: app,
        log: log
    };

    /*
    vasync.pipeline({
        funcs: [
            function _validateUpdate(_, cb) {
                validate.params(UPDATE_SCHEMA, opts, params,
                    function updateTokenValidateCb(err, parsed) {
                        if (err) {
                            cb(err);
                            return;
                        }
                        validatedParams = parsed;
                        cb();
                        return;
                    });
            },
            function _getOldToken(_, cb) {
            }
        }]
    })
    */
}

module.exports = {
    bucket: function () { return BUCKET; },
    create: createToken,
    del: deleteToken,
    Token: Token,
    get: getToken,
    getPin: getTokenPin,
    init: initTokenBucket,
    list: listTokens,
    update: updateToken
};
