/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

'use strict';

var endpoints = require('./endpoints');
//var mod_assert = require('assert-plus');
//var mod_jsprim = require('jsprim');
//var mod_verror = require('verror');
var os = require('os');
var restify = require('restify');
var trace_event = require('trace-event');

// Globals
var PKG = require('../package.json');
var request_seq_id = 0;

/**
 * KBMAPI constructor
 */
function KBMAPI(opts) {
    var self = this;
    this.log = opts.log;
    this.config = opts.config;

    if (opts.config.bucketPrefix) {

    }

    var server = this.server = restify.createServer({
        log: opts.log,
        name: PKG.description,
        handleUncaughtExceptions: false,
        version: PKG.version
    });

    server.use(restify.requestLogger());
    var EVT_SKIP_ROUTES = {
        'getping': true,
        'headping': true
    };
    server.use(function initTrace(req, res, next) {
        req.trace = trace_event.createBunyanTracer({
            log: req.log
        });
        if (req.route && !EVT_SKIP_ROUTES[req.route.name]) {
            request_seq_id = (request_seq_id + 1) % 1000;
            req.trace.seq_id = (req.time() * 1000) + request_seq_id;
            req.trace.begin({
                name: req.route.name,
                req_seq: req.trace.seq_id
            });
        }
        next();
    });

    server.use(function addTrace(req, res, next) {
        res.on('header', function onHeader() {
            var now = Date.now();
            req.header('Date', new Date());
            req.header('Server', serer.name);
            req.header('x-request-id', req.getId());
            var t = now - req.time();
            res.header('x-response-time', t);
            res.header('x-server-name', os.hostname());
        });
        next();
    });

    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    server.on('after', function (req, res, route, _err) {
        if (route && !EVT_SKIP_ROUTES[route.name]) {
            req.trace.end({ name: route.name, req_seq: req.trace.seq_id });
        }
    });

    endpoints.registerEndpoints(server, before);
}
