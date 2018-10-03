/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

'use strict';

var mod_moray = require('../moray');
var validate = require('../util/validate');
// Punt on updating for the moment
// var vasync = require('vasync');

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

// Fields that are removed from GET /pivtoken/:guid requests (but left
// in in GET /pivtoken/:guid/pin
// XXX Might it be better to instead explicitly list the public fields
// and assume everything else is private?
var SENSITIVE_FIELDS = [
    'pin'
];

var CREATE_SCHEMA = {
    required: {
        guid: validate.GUID,
        cn_uuid: validate.UUID,
        serial: validate.string, // XXX Or are these guaranteed to be a number?
        model: validate.string // XXX Could this be optional?
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

/*

var UPDATE_SCHEMA = {
    required: {
        guid: validate.GUID
    },
};
*/

function stripSensitiveFields(token) {
    SENSITIVE_FIELDS.forEach(function stripField(f) {
        delete token[f];
    });
}

/**
 * Token model constructor
 */
function Token(params) {
    this.params = {
        guid: params.guid,
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
        mod_moray.putObj(app.moray, BUCKET, token,
            function morayPutTokenCb(pErr) {
            if (pErr) {
                callback(pErr);
                return;
            }

            callback(null, token);
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

function listTokens(app, log, oparams, callback) {
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
                    stripSensitiveFields(token);
                });

                callback(null, tokens);
            });
        });
}

function _getTokenImpl(app, params, removeFields, callback) {
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
                var tokenObj = new Token(token.value);

                if (removeFields) {
                    stripSensitiveFields(tokenObj);
                }

                callback(null, tokenObj);
                return;
            });
    });
}

function getToken(app, log, params, callback) {
    log.debug(params, 'getToken: entry');
    _getTokenImpl(app, params, true, callback);
}

function getTokenPin(app, log, params, callback) {
    log.debug(params, 'getTokenPin: entry');
    _getTokenImpl(app, params, false, callback);
}

function initTokenBucket(app, cb) {
    mod_moray.initBucket(app.moray, BUCKET, cb);
}

    /*
// XXX I really don't know if it does make sense to allow for the updating
// of public keys on a token after addition.  Presumably this would be
// an authenticated operation once that piece is in place.
function updateToken(app, log, params, callback) {
    log.debug(params, 'updateToken: entry');
    var validatedParams;

    var opts = {
        app: app,
        log: log
    };

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
}
*/

module.exports = {
    bucket: function () { return BUCKET; },
    create: createToken,
    del: deleteToken,
    Token: Token,
    get: getToken,
    getPin: getTokenPin,
    init: initTokenBucket,
    list: listTokens
};
