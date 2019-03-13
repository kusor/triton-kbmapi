/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019, Joyent, Inc.
 */

/*
 * The kbmapi endpoints
 */

'use strict';

var mod_token = require('./models/token');
var mod_key = require('./models/key');
var restify = require('restify');

/**
 * GET /pivtokens: List all tokens
 */
function listTokens(req, res, next) {
    mod_token.list(req.app, req.log, req.params,
        function listTokenCb(err, tokens) {
        if (err) {
            next(err);
            return;
        }

        var serialized = [];
        for (var t in tokens) {
            serialized.push(tokens[t].serialize());
        }

        res.send(200, serialized);
        next();
        return;
    });
}

/**
 * GET /pivtokens/:guid: get a specific token
 */
function getToken(req, res, next) {
    mod_token.get(req.app, req.log, req.params,
        function getTokenCb(err, token) {
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
        return;
    });
}

/**
 * GET /pivtokens/:guid/pin: get the pin for a specific token
 */
function getTokenPin(req, res, next) {
    mod_token.getPin(req.app, req.log, req.params,
        function getTokenPinCb(err, token) {
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
        return;
    });
}

/**
 * POST /pivtokens: Add a new token
 */
function createToken(req, res, next) {
    mod_token.create(req.app, req.log, req.params, function (err, token) {
        if (err) {
            next(err);
            return;
        }

        res.send(200, token.serialize());
        next();
        return;
    });
}

/**
 * DELETE /pivtokens/:guid: delete a token
 * XXX: Might not be needed, but for POC at least it's there
 */
function deleteToken(req, res, next) {
    mod_token.del(req.app, req.log, req.params, function delTokenCb(err) {
        if (err) {
            next(err);
            return;
        }

        res.send(204);
        next();
        return;
    });
}

function createKey(req, res, next) {
    mod_key.create(req.app, req.log, req.params,
    function createKeyCb(err, key) {
        if (err) {
            next(err);
            return;
        }

        res.send(200, key.serialize());
        next();
        return;
    });
}

function getKey(req, res, next) {
    mod_key.get(req.app, req.log, req.params, function getKeyCb(err, key) {
        if (err) {
            next(err);
            return;
        }

        res.send(200, key.serialize());
        next();
        return;
    });
}

function deleteKey(req, res, next) {
    mod_key.del(req.app, req.log, req.params, function delKeyCb(err) {
        if (err) {
            next(err);
            return;
        }

        res.send(204);
        next();
        return;
    });
}

function register(http, before) {
    http.get({ path: '/pivtokens', name: 'listtokens' },
        before, listTokens);
    http.post({ path: '/pivtokens', name: 'createtoken' },
        before, createToken);
    http.get({ path: '/pivtokens/:guid', name: 'gettoken' },
        before, getToken);
    http.del({ path: '/pivtokens/:guid', name: 'deltoken' },
        before, deleteToken);
    http.get({ path: '/pivtokens/:guid/pin', name: 'gettokenpin' },
        before, getTokenPin);

    http.get({ path: '/key/:cn_uuid', name: 'getkey' },
        before, getKey);
    http.post({ path: '/key', name: 'createkey' },
        before, createKey);
    http.del({ path: '/key/:cn_uuid', name: 'deletekey' },
        before, deleteKey);
}

module.exports = {
    registerEndpoints: register
};
