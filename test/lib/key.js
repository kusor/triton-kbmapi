/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019, Joyent, Inc.
 */

/*
 * Test helpers for dealing with fabric VLANs
 */

'use strict';

var clone = require('clone');
var common = require('./common');
var doneErr = common.doneErr;
var mod_client = require('./client');
var log = require('./log');

var TYPE = 'key';

function createKey(t, opts, callback) {
    common.assertArgs(t, opts, callback);
    var client = opts.client || mod_client.get();

    log.debug({ params: opts.params }, 'creating key');
    opts.fillIn = [ 'cn_uuid' ];
    opts.type = TYPE;
    opts.reqType = 'create';

    var cn_uuid = opts.params.cn_uuid;
    var params = clone(opts.params);
    delete params.cn_uuid;

    if (!opts.desc && opts.expErr) {
        opts.desc = JSON.stringify(opts.params);
    }

    client.createKey(cn_uuid, params, common.reqOpts(t, opts),
        common.afterAPIcall.bind(null, t, opts, callback));
}

function createAndGetKey(t, opts, callback) {
    opts.reqType = 'create';
    createKey(t, opts, function (err, res) {
        if (err) {
            doneErr(err, t, callback);
            return;
        }
        opts.reqtype = 'get';

        getKey(t, opts, callback);
    });
}

function getKey(t, opts, callback) {
    common.assertArgs(t, opts, callback);
    var client = opts.client || mod_client.get();
    var cn_uuid = opts.params.cn_uuid;

    log.debug({ params: opts.params }, 'getting key');
    opts.type = TYPE;
    opts.reqType = 'get';

    client.getKey(cn_uuid, common.reqOpts(t, opts),
        common.afterAPIcall.bind(null, t, opts, callback));
}

function deleteKey(t, opts, callback) {
    common.assertArgs(t, opts, callback);
    var client = opts.client || mod_client.get();
    var cn_uuid = opts.params.cn_uuid;
    var params = clone(opts.params);

    log.debug({ params: opts.params }, 'deleting key');
    opts.id = cn_uuid;
    opts.type = TYPE;
    opts.reqType = 'del';

    delete params.guid;

    client.deleteKey(cn_uuid, params, common.reqOpts(t, opts),
        common.afterAPIdelete.bind(null, t, opts, callback));
}

module.exports = {
    create: createKey,
    createAndGet: createAndGetKey,
    delete: deleteKey,
    get: getKey
};
