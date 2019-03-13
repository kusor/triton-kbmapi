/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019, Joyent, Inc.
 */

/*
 * WARNING! WARNING! WARNING!  This is strictly for demo purposes.  If you use
 * this with live data, you almost certainly experience sadness at some point.
 * You have been warned.
 */

'use strict';

var mod_moray = require('../apis/moray');
var validate = require('../util/validate');

var BUCKET = {
    desc: 'cn key',
    name: 'kbmapi_cn_key',
    schema: {
        index: {
            cn_uuid: { type: 'uuid' }
        }
    },
    version: 0
};

var CREATE_SCHEMA = {
    required: {
        cn_uuid: validate.UUID,
        encryptKey: validate.string
    }
};

var GET_SCHEMA = {
    required: {
        cn_uuid: validate.UUID
    }
};

var DELETE_SCHEMA = {
    required: {
        cn_uuid: validate.UUID
    }
};

/**
 * Key model constructor
 */
function Key(params) {
    this.params = {
        cn_uuid: params.cn_uuid,
        encryptKey: params.encryptKey
    };
}

Object.defineProperty(Key.prototype, 'cn_uuid', {
    get: function getCnUUID() { return this.params.cn_uuid; }
});

/**
 * Returns the moray key for storing this Token object
 */
Key.prototype.key = function keyKey() {
    return this.params.cn_uuid;
};

Key.prototype.batch = function keyBatch() {
    return {
        bucket: BUCKET.name,
        key: this.params.cn_uuid,
        operation: 'put',
        value: this.raw(),
        options: {
            etag: this.etag
        }
    };
};

Key.prototype.delBatch = function keyDelBatch() {
    var batchObj = {
        bucket: BUCKET.name,
        key: this.cn_uuid,
        operation: 'delete'
    };

    return batchObj;
};

Key.prototype.raw = function keyRaw() {
    return {
        cn_uuid: this.params.cn_uuid,
        encryptKey: this.params.encryptKey,
        v: BUCKET.version
    };
};

Key.prototype.serialize = function keySerialize() {
    return {
        cn_uuid: this.params.cn_uuid,
        encryptKey: this.params.encryptKey
    };
};

function createKey(app, log, params, callback) {
    log.debug({ params: params }, 'createKey: entry');

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

        var key = new Key(params);
        mod_moray.putObj(app.moray, BUCKET, key,
            function morayPutTokenCb(pErr) {
            if (pErr) {
                callback(pErr);
                return;
            }

            callback(null, key);
        });
    });
}

function deleteKey(app, log, params, callback) {
    log.debug(params, 'deleteKey: entry');

    var dopts = {
        app: app,
        log: log
    };

    validate.params(DELETE_SCHEMA, dopts, params, function deleteKeyCb(err) {
        if (err) {
            callback(err);
            return;
        }

        app.moray.delObject(BUCKET.name, params.cn_uuid, callback);
    });
}

function getKey(app, log, params, callback) {
    log.debug(params, 'getKey: entry');
    validate.params(GET_SCHEMA, null, params, function getKeyValidateCb(err) {
        if (err) {
            callback(err);
            return;
        }

        mod_moray.getObj(app.moray, BUCKET, params.cn_uuid,
            function getKeyMorayCb(mErr, key) {
                if (mErr) {
                    callback(mErr);
                    return;
                }

                var keyObj = new Key(key.value);

                callback(null, keyObj);
                return;
            });
    });
}

function initKeyBucket(app, cb) {
    mod_moray.initBucket(app.moray, BUCKET, cb);
}

module.exports = {
    bucket: function () { return BUCKET; },
    create: createKey,
    del: deleteKey,
    Key: Key,
    get: getKey,
    init: initKeyBucket
};
