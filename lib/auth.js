/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';

var assert = require('assert-plus');
var httpSig = require('http-signature');
var restify = require('restify');
/*
var SIGN_ALGOS = [
    'ecdsa-sha256',
    'ecdsa-sha384',
    'ecdsa-sha512'
];
*/

var InvalidCreds = restify.InvalidCredentialsError;

var DEF_401 = 'You must make authenticated requests to use KBMAPI';
var INVALID_CREDS = 'Invalid authorization credentials supplied';

/*
 * Check whether the incoming HTTP request uses http-signature-auth
 * (https://tools.ietf.org/html/draft-cavage-http-signatures-03). If it does,
 * extract the key ID and hash from the Authentication header, verify the
 * signature is correct.
 */
function signatureAuth(req, res, next) {
    assert.ok(req.log);

    req.log.info({auth: req.headers.authorization}, 'signatureAuth');
    // Can do signature auth only against an existing token 9E pubkey.
    // If that's not already set into the req object, assume unauthenticated
    // request (for example, to create a new token from scratch).
    if (!req.token || !req.token.pubkeys || !req.token.pubkeys['9e']) {
        next();
        return;
    }

    if (!req.headers.authorization) {
        next(new InvalidCreds(DEF_401));
        return;
    }

    var pieces = req.headers.authorization.split(' ', 2);
    var scheme = pieces[0] || '';

    if (scheme.toLowerCase() !== 'signature') {
        next(new InvalidCreds(DEF_401));
        return;
    }

    try {
        var sig = httpSig.parseRequest(req, {});
    } catch (err) {
        next(err);
        return;
    }

    var log = req.log;

    var alg = sig.algorithm.toLowerCase().split('-');
    var key;

    if (alg[0] === 'hmac') {
        // Make sure we're using the most recent recovery token,
        // just in case something sorted out recovery_tokens on
        // a non chronological way
        var reqTokens = req.token.recovery_tokens.sort(function (a, b) {
            return a.created - b.created;
        });
        key = reqTokens[reqTokens.length - 1]['token'];
    } else {
        key = req.token.pubkeys['9e'];
    }

    var signatureVerified = false;

    try {
        signatureVerified = (alg[0] === 'hmac') ? httpSig.verifyHMAC(sig, key) :
                        httpSig.verifySignature(sig, key);
    } catch (err) {
        log.error({err: err}, 'verifySignature: exception');
        next(new InvalidCreds(INVALID_CREDS));
        return;
    }

    if (!signatureVerified) {
        next(new InvalidCreds(INVALID_CREDS));
        return;
    }

    next();
}

// --- exports

module.exports = {
    signatureAuth: signatureAuth
};

// vim: set softtabstop=4 shiftwidth=4:
