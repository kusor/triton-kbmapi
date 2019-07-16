/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
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
            callback(err);
            return;
        }

        if (val && val.replace(GUID_RE, '') !== '') {
            callback(errors.invalidParam(name,
                'must be a 32-character hex GUID'));
            return;
        }

        callback(null, val);
    });
}

function validateIsPresent(_, name, val, callback) {
    if (typeof (val) !== 'undefined' && val !== null && val !== '') {
        callback(null, val);
        return;
    }

    callback(errors.missingParam(name, 'must be present'));
}

function validatePubkeys(_, name, val, callback) {
    var msg = 'must be an object with keys 9a, 9d and 9e';
    var keyNames = ['9a', '9d', '9e'];

    if (typeof (val) !== 'object' || !Array.isArray(Object.keys(val))) {
        callback(errors.invalidParam(name, msg));
        return;
    }

    if (keyNames.some(function (k) {
        return typeof (val[k]) === 'undefined';
    })) {
        callback(errors.invalidParam(name, msg));
        return;
    }

    var errs = [];
    keyNames.forEach(function validateKey(k) {
        warden.string(_, name + '.' + k, val[k], function validkeyCb(err) {
            if (err) {
                errs.push(err);
            }
        });
    });

    /* eslint-disable callback-return */
    if (errs.length) {
        if (errs.length === 1) {
            callback(errs[0]);
        } else {
            callback(errors.InvalidParamsError('Invalid pubkeys', errs));
        }
        return;
    }
    /* eslint-enable callback-return */

    callback(null, val);
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
    UUID: warden.uuid,
    isPresent: validateIsPresent,
    pubKeys: validatePubkeys
};

// vim: set softtabstop=4 shiftwidth=4:
