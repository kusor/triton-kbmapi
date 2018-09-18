/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

/*
 * Handles initializing all models
 */

'use strict';

var mod_token = require('./token');
var vasync = require('vasync');

function initializeModels(app, callback) {
	// Probably a bit overkill, but hopefully makes it a bit easier to
	// add additional models as necessary
	vasync.forEachParallel({
		inputs: [
			mod_token
		],
		func: function _initModel(mod, cb) {
			mod.init(app, cb);
		}
	}, callback);
}

module.exports = {
	init: initializeModels,

	token: mod_token,

	models: [
		{
			constructor: mod_token.Token,
			bucket: mod_token.bucket()
		}
	]
};
