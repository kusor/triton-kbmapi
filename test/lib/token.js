/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
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

var TYPE = 'pivtoken';

function createToken(t, opts, callback) {
	common.assertArgs(t, opts, callback);
	var client = opts.client || mod_client.get();

	log.debug({ params: opts.params }, 'creating pivtoken');
	opts.fillIn = [ 'guid' ];
	opts.type = TYPE;
	opts.reqType = 'create';

	var guid = opts.params.guid;
	var params = clone(opts.params);
	delete params.guid;

	if (!opts.desc && opts.expErr) {
		opts.desc = JSON.stringify(opts.params);
	}

	client.createToken(guid, params, common.reqOpts(t, opts),
		common.afterAPIcall.bind(null, t, opts, callback));
}

function createAndGetToken(t, opts, callback) {
    opts.reqType = 'create';
    createToken(t, opts, function (err, res) {
        if (err) {
            return doneErr(err, t, callback);
        }
        opts.reqtype = 'get';

        return getToken(t, opts, callback);
    });
}

function getToken(t, opts, callback) {
    common.assertArgs(t, opts, callback);
    var client = opts.client || mod_client.get();
    var guid = opts.params.guid;
    var params = clone(opts.params);

    log.debug({ params: opts.params }, 'getting pivtoken');
    opts.type = TYPE;
    opts.reqType = 'get';

    delete params.guid;

    client.getToken(guid, params, common.reqOpts(t, opts),
        common.afterAPIcall.bind(null, t, opts, callback));
}

module.exports = {
    create: createToken,
    createAndGet: createAndGetToken,
    get: getToken
};
