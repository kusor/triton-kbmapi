/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

'use strict';

var errors = require('./errors');
var warden = require('restify-warden');

var GUID_RE = /[A-Z0-9]{32}/;

function validateBoolean(_, name, val, callback) {
    if (typeof (val) === 'boolean') {
        callback(null, val);
        return;
    }

    if (val === 'true' || val === 'false') {
        callback(null, val === 'true');
        return;
    }

    callback(errors.invalidParam(name, 'must be a boolean value'));
}

function validateGUID(_, name, val, callback) {
    warden.string(null, name, val, function (err) {
        if (err) {
            return callback(err);
        }

        if (val && val.replace(GUID_RE, '') !== '') {
            return callback(errors.invalidParam(name,
                'must be a 32-character hex GUID'));
        }

        callback(null, val);
        return;
    });
}

module.exports = {
    bool: validateBoolean,
    fieldsArray: warden.arrayOfFields,
    GUID: validateGUID,
    limit: warden.limit,
    offset: warden.offset,
    params: warden.params,
    string: warden.string,
    stringArray: warden.arrayOfString,
    UUID: warden.uuid
};
