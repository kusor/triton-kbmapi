/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

/*
 * The kbmapi endpoints
 */

//var mod_assert = require('assert-plus');
//var mod_jsprim = require('jsprim');
//var mod_verror = require('verror');

/**
 * GET /pivtokens: List all tokens
 */
function listTokens(req, res, next) {
    next();
}

/**
 * GET /pivtokens/:guid: get a specific token
 */
function getToken(req, res, next) {
    next();
}

/**
 * GET /pivtokens/:guid/pin: get the pin for a specific token
 */
function getTokenPin(req, res, next) {
    next();
}

/**
 * POST /pivtokens: Add a new token
 */
function createToken(req, res, next) {
    next();
}

/**
 * DELETE /pivtokens/:guid: delete a token
 * XXX: Might not be needed, but for POC at least it's there
 */
function deleteToken(req, res, next) {
    next();
}

// XXX: Should we also have a PUT /pivtokens for updates (additional keys?)

function register(http, before) {
    http.get({ path: '/pivtokens', name: 'listtokens' },
        before, listTokens);
    http.get({ path: '/pivtokens/:guid', name: 'gettoken' },
        before, getToken);
    http.del({ path: '/pivtokens/:guid', name: 'deltoken' },
        before, deleteToken);
    http.get({ path: '/pivtokens/:guid/pin', name: 'gettokenpin' },
        before, getTokenPin);
}

module.exports = {
    registerEndpoints: register
};
