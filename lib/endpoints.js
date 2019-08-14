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

var mod_token = require('./models/token');
var mod_auth = require('./auth');
var restify = require('restify');

/*
 * Pre-load a token, given req.params.guid. This will be used to verify auth
 * using http signature against token's pubkeys 9E for the methods requiring
 * this kind of authentication.
 */
function preloadToken(req, res, next) {
    mod_token.getPin({
        moray: req.app.moray,
        log: req.log,
        params: {
            guid: req.params.guid || req.params.token.guid
        }
    }, function getTokenCb(err, token) {
        if (err) {
            if (err.statusCode === 404) {
                next();
                return;
            }
            next(err);
            return;
        }

        req.token = token.serialize();
        next();
    });
}

/**
 * GET /pivtokens: List all tokens
 *
 * This is not an authenticated request. Only "public" fields are listed.
 */
function listTokens(req, res, next) {
    mod_token.list({
        moray: req.app.moray,
        log: req.log,
        params: req.params
    }, function listTokenCb(err, tokens) {
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
function getToken(req, res, next) {
    mod_token.get({
        moray: req.app.moray,
        log: req.log,
        params: req.params
    }, function getTokenCb(err, token) {
        if (err) {
            next(err);
            return;
        }

        if (!token) {
            next(new restify.ResourceNotFoundError('token not found'));
            return;
        }

        res.send(200, token.serialize());
        next();
    });
}

/**
 * GET /pivtokens/:guid/pin: get the pin for a specific token
 *
 * This is a HTTP Signature Authenticated request.
 */
function getTokenPin(req, res, next) {
    if (!req.token) {
        next(new restify.ResourceNotFoundError('token not found'));
        return;
    }

    res.send(200, req.token);
    next();
}

/**
 * POST /pivtokens: Add a new token.
 *
 * In order to allow the client to retrieve the create request response
 * in case it was lost, if we find that the token already exists, we'll
 * just return it.
 *
 * This is a HTTP Signature Authenticated request if the Token already
 * exists. Otherwise, a new Token can be created w/o Authentication.
 *
 * _Anyway_, to be able to retrieve a lost response, it's recommended
 * to always use HTTP Signature.
 */
function createToken(req, res, next) {
    if (req.token) {
        res.send(200, req.token);
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

        res.send(200, token.serialize());
        next();
    });
}

/**
 * DELETE /pivtokens/:guid: delete a token
 *
 * This is a HTTP Signature Authenticated request.
 */
function deleteToken(req, res, next) {
    if (!req.token) {
        next(new restify.ResourceNotFoundError('token not found'));
        return;
    }

    mod_token.del({
        moray: req.app.moray,
        log: req.log,
        params: req.params
    }, function delTokenCb(err) {
        if (err) {
            next(err);
            return;
        }

        res.send(204);
        next();
    });
}

// XXX: Should we also have a PUT /pivtokens for updates (additional keys?)

function register(http, before) {
    http.get({
        path: '/pivtokens',
        name: 'listtokens'
    }, before, listTokens);
    http.post({
        path: '/pivtokens',
        name: 'createtoken'
    }, before, preloadToken, mod_auth.signatureAuth, createToken);
    http.get({
        path: '/pivtokens/:guid',
        name: 'gettoken'
    }, before, getToken);
    http.del({
        path: '/pivtokens/:guid',
        name: 'deltoken'
    }, before, preloadToken, mod_auth.signatureAuth, deleteToken);
    http.get({
        path: '/pivtokens/:guid/pin',
        name: 'gettokenpin'
    }, before, preloadToken, mod_auth.signatureAuth, getTokenPin);
}

module.exports = {
    registerEndpoints: register
};
// vim: set softtabstop=4 shiftwidth=4:
