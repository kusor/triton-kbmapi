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

const cp = require('child_process');
const util = require('util');
const format = util.format;

const assert = require('assert-plus');
const httpSignature = require('http-signature');
const jsprim = require('jsprim');
const restifyClients = require('restify-clients');

const AUTHZ_FMT =
  'Signature keyId="%s",algorithm="%s",headers="%s",signature="%s"';


// --- Exported Client


/*
 * This is an example from kbmd:
 * date="$(LC_TIME=C TZ=GMT date +"%a, %d %b %Y %T %Z")"
 * sig="$(echo $date | $PIVYTOOL sign 9e | $OPENSSL enc -base64 -A)"
 *
 * pin=$($CURL -sS \
 *  -H "Date: $date" \
 *  -H "Authorization: $sig" \
 *  "$url" | json pin) || exit 1
 *
 */

var SIGNER;
var PRIVKEY;
var PUBKEY;
var OPENSSL;
var PIVYTOOL;

function requestSigner(req) {
    var signatureRequired = {
        'get': ['/auth'],
        'post': ['/pivtokens'],
        'put': [],
        'delete': []
    };

    if (signatureRequired[req.method.toLowerCase()].indexOf(req.path) === -1) {
        return false;
    }

    if (SIGNER === 'httpSignature') {
        httpSignature.signRequest(req, {
            key: PRIVKEY,
            keyId: httpSignature.sshKeyFingerprint(PUBKEY)
        });
    } else {
        // XXX: WIP Still getting 411 requests signed like this:
        var date = req.getHeader('Date');
        if (!date) {
            date = jsprim.rfc1123(new Date());
            req.setHeader('Date', date);
        }


        var cmd = format('echo %s | %s sign 9e | %s enc -base64 -A',
                         date, PIVYTOOL, OPENSSL);
        try {
            var result = cp.execSync(cmd);
        } catch (err) {
            req.log.error({err: err}, 'PIVYTOOL sign error');
            return false;
        }

        req.setHeader('Authorization', util.format(AUTHZ_FMT,
            httpSignature.sshKeyFingerprint(PUBKEY),
           'ecdsa-sha256',
           'date',
           result.toString().trim()));
    }
    return true;
}

function KBMAPI(options) {
    assert.object(options, 'options');
    assert.string(options.url, 'options.url');
    assert.optionalObject(options.contentMd5, 'options.contentMd5');

    if (!options.contentMd5) {
        options.contentMd5 = {
            encodings: ['utf8', 'binary']
        };
    }

    options.signRequest = function signRequest(req) {
        requestSigner(req);
    };

    this.client = restifyClients.createJsonClient(options);
}

/**
 * Creates a pivtoken
 *
 * @param {Object} opts object containing:
 *      - {String} guid: (required) the guid of the token.
 *      - {Object} token: (required) the token to be created.
 *      - {Function} signer: (optional) http request signer. Required only when
 *        the POST request will attempt to override an existing token. This
 *        signer object should be able to receive a HTTP Date and use it to
 *        generate the HTTP Signature Auth header which will be used to perform
 *        the HTTP request authentication using the token 9e pubkey.
 * @param {Function} cb: of the form f(err, token, res)
 *
 */
KBMAPI.prototype.createToken = function createToken(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.guid, 'opts.guid');
    assert.object(opts.token, 'opts.token');
    assert.func(cb, 'cb');

    opts.token.guid = opts.guid;

    // XXX: Modify to properly extract these options for all methods needing:
    PRIVKEY = opts.privkey;
    PUBKEY = opts.token.pubkeys['9e'];

    var reqOpts = Object.assign(opts, {
        path: '/pivtokens',
        data: opts.token,
        method: 'POST'
    });

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
    assert.object(opts.token, 'opts.token');
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



KBMAPI.prototype.testAuth = function getToken(opts, cb) {
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    var reqOpts = {
        path: '/auth',
        method: 'GET',
        data: opts.token
    };

    PRIVKEY = opts.privkey;
    PUBKEY = opts.token.pubkeys['9e'];

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
    assert.string(opts.path, 'opts.path');
    assert.optionalObject(opts.headers, 'opts.headers');
    assert.optionalString(opts.privkey, 'opts.privkey');
    assert.optionalString(opts.pivytool, 'opts.piviTool');
    assert.optionalString(opts.openssl, 'opts.openssl');
    assert.func(cb, 'cb');

    var method = (opts.method || 'GET').toLowerCase();
    assert.ok(['get', 'post', 'put', 'delete', 'head'].indexOf(method) >= 0,
        'invalid HTTP method given');
    var clientFnName = (method === 'delete' ? 'del' : method);

    SIGNER = opts.privkey ? 'httpSignature' : 'pivytool';

    var reqOpts = {
        token: opts.data,
        method: method,
        path: opts.path
    };

    if (opts.headers) {
        reqOpts.headers = opts.headers;
    }

    if (opts.privkey) {
        PRIVKEY = opts.privkey;
    } else {
        PIVYTOOL = process.env.PIVYTOOL ||
                    opts.pivytool ||
                    '/usr/sbin/pivy-tool';
        OPENSSL = process.env.OPENSSL ||
                    opts.openssl ||
                    '/usr/bin/openssl';
    }


    if (opts.data) {
        self.client[clientFnName](reqOpts, opts.data, cb);
    } else {
        self.client[clientFnName](reqOpts, cb);
    }
};

module.exports = KBMAPI;
