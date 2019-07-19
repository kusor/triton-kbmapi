/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Client library for the Triton Key Backup and Management API (KBMAPI)
 */

'use strict';

var assert = require('assert-plus');
// var httpSignature = require('http-signature');
var restifyClients = require('restify-clients');

var util = require('util');
var format = util.format;

// --- Exported Client

function KBMAPI(options) {
    assert.object(options, 'options');
    assert.string(options.url, 'options.url');
    assert.optionalObject(options.contentMd5, 'options.contentMd5');

    if (!options.contentMd5) {
        options.contentMd5 = {
            encodings: ['utf8', 'binary']
        };
    }

    this.client = restifyClients.createJsonClient(options);
}

/**
 * Creates a pivtoken
 *
 * @param {Object} opts object containing:
 *      - {String} guid: (required) the guid of the token.
 *      - {Object} token: the token to be created.
 * @param {Function} cb: of the form f(err, token, res)
 *
 */
KBMAPI.prototype.createToken = function createToken(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.guid, 'opts.guid');
    assert.object(opts.token, 'opts.token');
    assert.func(cb, 'cb');

    opts.token.guid = opts.guid;

    var reqOpts = {
        path: '/pivtokens',
        data: opts.token,
        method: 'POST'
    };

    this._request(reqOpts, function reqCb(err, req, res, body) {
        cb(err, body, res);
    });
};

/**
 * Deletes the pivtoken specified by GUID
 *
 * @param {Object} opts object containing:
 *      - {String} guid: (required) the guid of the token to be destroyed.
 * @param {Function} cb: of the form f(err, res)
 */
KBMAPI.prototype.deleteToken = function deleteToken(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.guid, 'opts.guid');
    assert.func(cb, 'cb');


    var reqOpts = {
        path: format('/pivtokens/%s', opts.guid),
        method: 'DELETE'
    };

    this._request(reqOpts, function reqCb(err, req, res) {
        cb(err, res);
    });
};

/**
 * List all tokens
 *
 * @param {Object} opts object containing any list filtering argument
 *          like `offset`, `limit` ...
 * @param {Function} cb: of the form f(err, tokens, res)
 */
KBMAPI.prototype.listTokens = function listTokens(opts, cb) {
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    var reqOpts = {
        method: 'GET',
        path: '/pivtokens',
        query: opts
    };

    this._request(reqOpts, function reqCb(err, req, res, body) {
        cb(err, body, res);
    });
};

// XXX No update for the moment

/**
 * Gets the public information about a token
 *
 * @param {Object} opts object containing:
 *      - {String} guid: (required) the guid of the token.
 * @param {Function} cb: of the form f(err, token, res)
 */
KBMAPI.prototype.getToken = function getToken(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.guid, 'opts.guid');
    assert.func(cb, 'cb');

    var reqOpts = {
        path: format('/pivtokens/%s', opts.guid),
        method: 'GET'
    };

    this._request(reqOpts, function reqCb(err, req, res, body) {
        cb(err, body, res);
    });
};

/**
 * Gets the token info including PIN.
 * XXX In the released version, this will require authenticating
 *
 * @param {Object} opts object containing:
 *      - {String} guid: (required) the guid of the token.
 * @param {Function} callback: of the form f(err, token, res)
 */
KBMAPI.prototype.getTokenPin = function getTokenPin(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.guid, 'opts.guid');
    assert.func(cb, 'cb');

    var reqOpts = {
        path: format('/pivtokens/%s/pin', opts.guid),
        method: 'GET'
    };

    this._request(reqOpts, function reqCb(err, req, res, body) {
        cb(err, body, res);
    });
};


/**
 * KBMAPI request wrapper - modeled after http.request.
 *
 * Pretty much the same thing used by node-triton's CloudAPI library
 * without users & roles information.
 *
 * @param {Object|String} opts - object or string for endpoint
 *      - {String} path - URL endpoint to hit
 *      - {String} method - HTTP(s) request method
 *      - {Object} data - data to be passed
 *      - {Object} headers - optional additional request headers
 * @param {Function} cb passed via the restify client

 */
KBMAPI.prototype._request = function _request(opts, cb) {
    var self = this;

    if (typeof (opts) === 'string') {
        opts = {
            path: opts
        };
    }
    assert.object(opts, 'opts');
    assert.optionalObject(opts.data, 'opts.data');
    assert.optionalString(opts.method, 'opts.method');
    assert.optionalObject(opts.headers, 'opts.headers');
    assert.func(cb, 'cb');

    var method = (opts.method || 'GET').toLowerCase();
    assert.ok(['get', 'post', 'put', 'delete', 'head'].indexOf(method) >= 0,
        'invalid HTTP method given');
    var clientFnName = (method === 'delete' ? 'del' : method);

/*
    self._authHeaders(method, opts.path, function (err, headers) {
        if (err) {
            cb(err);
            return;
        }

        if (opts.headers) {
            headers = Object.assign(headers, opts.headers);
        }
*/
        var reqOpts = {
            path: opts.path// ,
//            headers: headers
        };

        if (opts.data) {
            self.client[clientFnName](reqOpts, opts.data, cb);
        } else {
            self.client[clientFnName](reqOpts, cb);
        }
//    });
};
/*
KBMAPI.prototype._authHeaders = function _authHeaders(method, path, cb) {

    assert.string(method, 'method');
    assert.string(path, 'path');
    assert.func(cb, 'cb');

    var headers = {};

    var rs;
    if (this.principal.sign !== undefined) {
        rs = auth.requestSigner({
            sign: this.principal.sign
        });
    } else if (this.principal.keyPair !== undefined) {
        try {
            rs = this.principal.keyPair.createRequestSigner({
                user: this.principal.account,
                subuser: this.principal.user
            });
        } catch (signerErr) {
            callback(new errors.SigningError(signerErr));
            return;
        }
    }


    httpSignature.sign(req, {
      key: key,
      keyId: './cert.pem'
    });

    rs.writeTarget(method, path);
    headers.date = rs.writeDateHeader();

    rs.sign(function (err, authz) {
        if (err || !authz) {
            cb(new errors.SigningError(err));
            return;
        }
        headers.authorization = authz;
        cb(null, headers);
    });
};
*/

module.exports = KBMAPI;
