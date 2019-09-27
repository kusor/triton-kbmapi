/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Unit tests for recovery-configurations endpoints
 */

'use strict';

const fs = require('fs');
const path = require('path');
// So linter doesn't complain b/c I do have it around and not used for now.
const _util = require('util');

const h = require('../helpers');
const mod_server = require('../../lib/server');
const test = require('tape');

const eboxTpl = fs.readFileSync(path.resolve(
    __dirname, '../../backup'), 'ascii');

var KBMAPI;
var MORAY;
var CLIENT;
var RECOVERY_CONFIG;


test('Initial setup', function tInitialSetup(suite) {
    h.reset();

    suite.test('Create client and server', function tCreateClientServer(t) {
        h.createClientAndServer(function (err, client, moray, server) {
            KBMAPI = server;
            MORAY = moray;
            CLIENT = client;
            t.ifError(err, 'server creation');
            t.ok(KBMAPI, 'server');
            t.ok(MORAY, 'moray');
            t.ok(CLIENT, 'client');
            t.end();
        });
    });

    suite.test('Create RecoveryConfiguration', function doCreate(t) {
        CLIENT.createRecoveryConfiguration({
            template: eboxTpl
        }, function createCb(err, recoveryConfig, res) {
            t.ifError(err, 'create recovery configuration error');
            t.ok(recoveryConfig, 'recoveryConfig');
            t.ok(recoveryConfig.uuid, 'recoveryConfig UUID');
            t.ok(recoveryConfig.created, 'recoveryConfig created');
            RECOVERY_CONFIG = recoveryConfig;
            t.equal(res.statusCode, 201, 'create rec-cfg response code');
            t.end();
        });
    });

    suite.test('Get RecoveryConfiguration', function doGet(t) {
        CLIENT.getRecoveryConfiguration({
            uuid: RECOVERY_CONFIG.uuid
        }, function (err, recoveryConfig, res) {
            t.ifError(err, 'get recovery configuration error');
            t.equal(res.statusCode, 200, 'get rec-cfg response code');
            t.deepEqual(RECOVERY_CONFIG, recoveryConfig,
                'expected recovery config');
            t.end();
        });
    });

    suite.test('Get 404 RecoveryConfiguration', function doGet404(t) {
        CLIENT.getRecoveryConfiguration({
            uuid: '00000000-0000-0000-0000-000000000003'
        }, function (err, _recoveryConfig, res) {
            t.ok(err, 'Get recovery configuration 404');
            t.equal(res.statusCode, 404, 'get rec-cfg response code');
            t.end();
        });
    });

    suite.test('Delete RecoveryConfiguration', function doDel(t) {
        CLIENT.deleteRecoveryConfiguration({
            uuid: RECOVERY_CONFIG.uuid
        }, function delCb(err, res) {
            t.ifError(err, 'Delete RecoveryConfiguration error');
            t.equal(res.statusCode, 204, 'delete rec-cfg response code');
            t.end();
        });
    });

    suite.test('Delete 404 RecoveryConfiguration', function doDel404(t) {
        CLIENT.deleteRecoveryConfiguration({
            uuid: '00000000-0000-0000-0000-000000000003'
        }, function (err, res) {
            t.ok(err, 'Delete recovery configuration 404');
            t.equal(res.statusCode, 404, 'delete rec-cfg response code');
            t.end();
        });
    });
});


test('Stop server', function closeServers(t) {
    KBMAPI.server.close();
    mod_server.close(t);
});

// vim: set softtabstop=4 shiftwidth=4:
