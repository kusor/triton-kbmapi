/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Generic methods shared across the different KBMAPI's models
 */

'use strict';
const crypto = require('crypto');
const assert = require('assert-plus');

const mod_moray = require('../apis/moray');
const validate = require('../util/validate');

/*
 * Generic model constructor.
 *
 */
function Model(params) {
    this.params = {
        uuid: params.uuid
    };
    this.etag = params.etag || null;
}

/*
 * Required by moray client implementation in use.
 */
Model.prototype.key = function key() {
    return this.params.uuid;
};

Model.prototype.batch = function batch(bucket) {
    return {
        bucket: bucket.name,
        key: this.params.uuid,
        operation: 'put',
        value: this.raw(),
        options: {
            etag: this.etag
        }
    };
};

Model.prototype.serialize = function serialize() {
    return {
        uuid: this.params.uuid
    };
};

/*
 * Required by moray client implementation in use.
 */
Model.prototype.raw = function raw(bucket) {
    var self = this;
    return (Object.assign(self.serialize(), {v: bucket.version}));
};


function createModel(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.object(opts.params, 'opts.params');
    assert.func(opts.model, 'opts.model');
    assert.object(opts.bucket, 'opts.bucket');
    assert.object(opts.createSchema, 'opts.createSchema');
    assert.func(callback, 'callback');

    function validCb(err) {
        if (err) {
            callback(err);
            return;
        }

        var obj = new opts.model(opts.params);

        mod_moray.putObj(opts.moray, opts.bucket, obj, function putCb(pErr) {
            if (pErr) {
                callback(pErr);
                return;
            }

            callback(null, obj);
        });
    }

    validate.params(opts.createSchema, null, opts.params, validCb);
}


function updateModel(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.object(opts.bucket, 'opts.bucket');
    assert.string(opts.key, 'opts.key');
    assert.object(opts.original, 'opts.original');
    assert.string(opts.etag, 'opts.etag');
    assert.object(opts.val, 'opts.val');
    assert.optionalBool(opts.remove, 'opts.remove');
    assert.func(callback, 'callback');

    mod_moray.updateObj({
        moray: opts.moray,
        bucket: opts.bucket,
        key: opts.key,
        original: opts.original,
        etag: opts.etag,
        val: opts.val,
        remove: opts.remove || false
    }, function updateCb(pErr, newVal) {
        if (pErr) {
            callback(pErr);
            return;
        }

        callback(null, newVal);
    });
}


function getModel(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.string(opts.key, 'opts.key');
    assert.func(opts.model, 'opts.model');
    assert.object(opts.bucket, 'opts.bucket');
    assert.func(callback, 'callback');

    mod_moray.getObj(opts.moray, opts.bucket, opts.key,
        function getCb(mErr, rec) {
            if (mErr) {
                callback(mErr);
                return;
            }

            var obj = new opts.model(rec.value);
            obj.etag = rec._etag;
            callback(null, obj);
    });
}


function deleteModel(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.string(opts.key, 'opts.key');
    assert.object(opts.bucket, 'opts.bucket');
    assert.optionalString(opts.etag, 'opts.etag');
    assert.func(callback, 'callback');

    mod_moray.delObj(opts, callback);
}


function repeatableUUIDFromString(str) {
    const hash = crypto.createHash('sha512');
    hash.update(str);
    var buf = hash.digest();
    // variant:
    buf[8] = buf[8] & 0x3f | 0xa0;
    // version:
    buf[6] = buf[6] & 0x0f | 0x50;
    var hex = buf.toString('hex', 0, 16);
    const uuid = [
        hex.substring(0, 8),
        hex.substring(8, 12),
        hex.substring(12, 16),
        hex.substring(16, 20),
        hex.substring(20, 32)
    ].join('-');
    return uuid;
}

module.exports = {
    Model: Model,
    get: getModel,
    del: deleteModel,
    create: createModel,
    update: updateModel,
    uuid: repeatableUUIDFromString
};

// vim: set softtabstop=4 shiftwidth=4:
