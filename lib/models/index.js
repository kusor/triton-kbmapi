/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Handles initializing all models
 */

'use strict';

var mod_model = require('./model');
var mod_pivtoken = require('./pivtoken');
var mod_pivtoken_history = require('./pivtoken-history');
var mod_recovery_token = require('./recovery-token');
var mod_recovery_configuration = require('./recovery-configuration');
var vasync = require('vasync');

function initializeModels(app, callback) {
    vasync.forEachParallel({
        inputs: [
            mod_pivtoken,
            mod_pivtoken_history,
            mod_recovery_token,
            mod_recovery_configuration
        ],
        func: function _initModel(mod, cb) {
            mod.init(app.moray, cb);
        }
    }, callback);
}

module.exports = {
    init: initializeModels,
    pivtoken: mod_pivtoken,
    pivtoken_history: mod_pivtoken_history,
    recovery_configuration: mod_recovery_configuration,
    recovery_token: mod_recovery_token,
    uuid: mod_model.uuid,

    models: [
        {
            constructor: mod_pivtoken.PIVToken,
            bucket: mod_pivtoken.bucket()
        },
        {
            constructor: mod_pivtoken_history.PIVToken,
            bucket: mod_pivtoken_history.bucket()
        },
        {
            constructor: mod_recovery_configuration,
            bucket: mod_recovery_configuration.bucket()
        },
        {
            constructor: mod_recovery_token,
            bucket: mod_recovery_token.bucket()
        }
    ]
};
// vim: set softtabstop=4 shiftwidth=4:
