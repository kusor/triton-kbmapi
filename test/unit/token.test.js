/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017, Joyent, Inc.
 */

/*
 * Unit tests for token endpoints
 */

'use strict';

var h = require('./helpers');
// var mod_token = require('../lib/token');
var test = require('tape');

// var KBMAPI;
// var MORAY;

test('Initial setup', function (t) {
	h.reset();

	t.test('create client and server', function (t2) {
		h.createClientAndServer(function (err, res, _moray) {
			t2.ifError(err, 'server creation');
			t2.ok(res, 'client');
			t2.ok(res, 'moray');

            // KBMAPI = res;
            // MORAY = moray;

			t2.end();
		});
	});
});
