/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

'use strict';

var mod_moray = require('apis/moray');
var validate = require('util/validate.js');

var BUCKET = {
    desc: 'piv tokens',
    name: 'kbmapi_piv_token',
    schema: {
        index: {
            guid: { type: 'string', unique: true },
            cn_uuid: { type: 'uuid', unique: true },
            serial: { type: 'string', unique: true },
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
    'attestation',
];

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

var UPDATE_SCHEMA = {
    required: {
        guid: valudate.GUID
    }
};

/**
 * Token model constructor
 */
function Token(params) {
    this.params = {
        guid: params.name,
        cn_uuid: params.cn_uuid
    };
}

function createToken(opts, cb) {
}

function deleteToken(opts, cb) {
}

function getToken(opts, cb) {
}

function getTokenPin(opts, cb) {
}

function initTokenBucket(app, cb) {
    mod_moray.initBucket(app.moray, BUCKET, cb);
}

function listTokens(opts, cb) {
}

function updateToken(opts, cb) {
}

module.exports = {
    bucket: function() { return BUCKET; },
    create: createToken,
    del: deleteToken,
    Token: Token,
    get: getToken,
    getPin: getTokenPin,
    init: initTokenBucket,
    list: listTokens,
    update: updateToken
};
