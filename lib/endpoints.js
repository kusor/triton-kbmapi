/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * The kbmapi endpoints
 */

'use strict';

const mod_token = require('./models/token');
const mod_token_history = require('./models/token-history');
const mod_auth = require('./auth');

const assert = require('assert-plus');
const restify = require('restify');

/*
 * Pre-load a pivtoken, given req.params.guid. This will be used to verify auth
 * using http signature against pivtoken's pubkeys 9E for the methods requiring
 * this kind of authentication.
 */
function preloadPivtoken(req, res, next) {
    mod_token.getPin({
        moray: req.app.moray,
        log: req.log,
        params: {
            guid: req.params.guid || req.params.token.guid
        }
    }, function getPivtokenCb(err, token) {
        if (err) {
            if (err.statusCode === 404) {
                next();
                return;
            }
            next(err);
            return;
        }

        req.pivtoken = token.serialize();
        req.rawPivtoken = token.raw();
        next();
    });
}


/*
 * Archive and then remove the given pivtoken from pivtokens bucket.
 * Used either to directly delete an existing pivtoken or during
 * pivtoken recovery for a given CN.
 *
 * @param {Object} moray connection object
 * @param {Object} log Bunyan instance logger object
 * @param {Object} token Raw pivtoken object
 * @param {Function} cb of the form f(err)
 */

function archiveAndDeletePivtoken(moray, log, token, cb) {
    assert.object(moray, 'moray');
    assert.object(log, 'log');
    assert.object(token, 'token');
    assert.func(cb, 'cb');
    assert.string(token.guid, 'token.guid');

    mod_token_history.create({
        moray: moray,
        log: log,
        params: token
    }, function createTkHistoryCb(historyErr) {
        if (historyErr) {
            cb(historyErr);
            return;
        }

        mod_token.del({
            moray: moray,
            log: log,
            params: token
        }, function delPivtokenCb(err) {
            if (err) {
                cb(err);
                return;
            }

            cb();
        });
    });
}
/**
 * GET /pivtokens: List all pivtokens
 *
 * This is not an authenticated request. Only "public" fields are listed.
 */
function listPivtokens(req, res, next) {
    mod_token.list({
        moray: req.app.moray,
        log: req.log,
        params: req.params
    }, function listPivtokenCb(err, tokens) {
        if (err) {
            next(err);
            return;
        }

        res.send(200, tokens.map(function serialize(token) {
            return token.serialize();
        }));
        next();
    });
}

/**
 * GET /pivtokens/:guid: get a specific token
 *
 * This is not an authenticated request. Only "public" fields are retrieved.
 */
function getPivtoken(req, res, next) {
    mod_token.get({
        moray: req.app.moray,
        log: req.log,
        params: req.params
    }, function getPivtokenCb(err, token) {
        if (err) {
            next(err);
            return;
        }

        if (!token) {
            next(new restify.ResourceNotFoundError('pivtoken not found'));
            return;
        }

        res.send(200, token.serialize());
        next();
    });
}

/**
 * GET /pivtokens/:guid/pin: get the pin for a specific pivtoken
 *
 * This is a HTTP Signature Authenticated request.
 */
function getPivtokenPin(req, res, next) {
    if (!req.pivtoken) {
        next(new restify.ResourceNotFoundError('pivtoken not found'));
        return;
    }

    res.send(200, req.pivtoken);
    next();
}

/**
 * POST /pivtokens: Add a new pivtoken.
 *
 * In order to allow the client to retrieve the create request response
 * in case it was lost, if we find that the pivtoken already exists, we'll
 * just return it.
 *
 * This is a HTTP Signature Authenticated request if the Pivtoken already
 * exists. Otherwise, a new Pivtoken can be created w/o Authentication.
 *
 * _Anyway_, to be able to retrieve a lost response, it's recommended
 * to always use HTTP Signature.
 */
function createPivtoken(req, res, next) {
    if (req.pivtoken) {
        res.send(200, req.pivtoken);
        next();
        return;
    }

    mod_token.create({
        moray: req.app.moray,
        log: req.log,
        params: req.params
    }, function (err, token) {
        if (err) {
            next(err);
            return;
        }

        res.send(201, token.serialize());
        next();
    });
}

/**
 * DELETE /pivtokens/:guid: delete a pivtoken
 *
 * This is a HTTP Signature Authenticated request.
 */
function deletePivtoken(req, res, next) {
    if (!req.pivtoken) {
        next(new restify.ResourceNotFoundError('pivtoken not found'));
        return;
    }

    archiveAndDeletePivtoken(req.app.moray, req.log, req.rawPivtoken,
        function delCb(err) {
        if (err) {
            next(err);
            return;
        }
        res.send(204);
        next();
    });
}


/**
 * POST /pivtokens/:guid/recover: recover the given pivtoken :guid with a new
 * (provided) token.
 *
 * This is a request authenticated using HMAC and original pivtoken's
 * recovery_token.
 */
function recoveryPivtoken(req, res, next) {
    if (!req.pivtoken) {
        next(new restify.ResourceNotFoundError('pivtoken not found'));
        return;
    }

    archiveAndDeletePivtoken(req.app.moray, req.log, req.rawPivtoken,
        function delCb(err) {
        if (err) {
            next(err);
            return;
        }

        mod_token.create({
            moray: req.app.moray,
            log: req.log,
            params: req.params.token
        }, function (createErr, token) {
            if (createErr) {
                next(createErr);
                return;
            }

            res.send(201, token.serialize());
            next();
        });
    });
}

// XXX: to-do:
// UpdatePivtoken (PUT /pivtokens/:guid)
// Currently, the only field that can be altered is the cn_uuid field
// (e.g. during a chassis swap). If the new cn_uuid field is already
// associated with an assigned token, or if any of the remaining fields differ,
// the update fails.

// This request is authenticated by signing the Date header with the token's 9e
// key (same as CreatePivtoken). This however does not return the recovery token
// in it's response.



function register(http, before) {
    http.get({
        path: '/pivtokens',
        name: 'listtokens'
    }, before, listPivtokens);
    http.post({
        path: '/pivtokens',
        name: 'createtoken'
    }, before, preloadPivtoken, mod_auth.signatureAuth, createPivtoken);
    http.get({
        path: '/pivtokens/:guid',
        name: 'gettoken'
    }, before, getPivtoken);
    http.del({
        path: '/pivtokens/:guid',
        name: 'deltoken'
    }, before, preloadPivtoken, mod_auth.signatureAuth, deletePivtoken);
    http.get({
        path: '/pivtokens/:guid/pin',
        name: 'gettokenpin'
    }, before, preloadPivtoken, mod_auth.signatureAuth, getPivtokenPin);
    http.post({
        path: '/pivtokens/:guid/recover',
        name: 'recoverytoken'
    }, before, preloadPivtoken, mod_auth.signatureAuth, recoveryPivtoken);
}

module.exports = {
    registerEndpoints: register
};
// vim: set softtabstop=4 shiftwidth=4:
