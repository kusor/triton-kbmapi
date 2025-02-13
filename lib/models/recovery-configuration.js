/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Recovery Configuration model and associated functions
 */

// TODO: Validate provided eBox template.


/*
 * Valid transitions for the different recovery configuration
 * (recCfg) states.
 *
 * This includes the existence or not of recCfg transition records
 * associated with the current recCfg.
 *
 * The following is a list of the different recCfg statuses based
 * into the different properties of recCfg itself and the associated
 * recCfgTransition object created each time a transition from one
 * state to another begins.
 *
 * - "NEW": Only the recCfg exists. None of 'staged', 'activated' or
 *   'expired' exists.
 * - "STAGING": The field 'staged' hasn't been set yet, but there's
 *   a recCfgTransition with name set to "stage", which may or not
 *   have been started yet.
 * - "STAGED": The aforementioned recCfg transition has finished (and
 *   the proper 'finished' timestamp has been added to it) and the
 *   'staged' timestamp has been set for the recovery config itself.
 * - "UNSTAGING": A new recCfgTransition has been created with name
 *   "unstage". It's not 'finished' yet. (When this transition finishes
 *   the 'staged' value will be removed from the recovery config
 *   object).
 * - "ACTIVATING": The field 'activated' hasn't been set yet, but
 *   there is a recCfgTranstiion with name set to "activate", which
 *   may or not have been started yet
 * - "ACTIVE": The aforementioned recCfg transition has finished (and
 *   the proper 'finished' timestamp has been added to it) and the
 *   'activated' timestamp has been set for the recovery config itself.
 * - "DEACTIVATING": A new recCfgTransition has been created with name
 *   "deactivate". It's not 'finished' yet. (When this transition
 *   finishes the 'activated' value will be removed from the recovery
 *   config object).
 * - "EXPIRED": A given recovery configuration will enter the 'expired'
 *   state when another one enters the 'active' state. There's no
 *   transition for this state change. The 'expired' recCfg will reach
 *   that state straight from 'active'. The 'expired' field will be
 *   added to the recovery configuration record.
 * - "REACTIVATED": There's no such 'reactivated' state, but 'created',
 *   which can be reached by a recovery configuration in 'expired' state.
 *   Again, there's no recCfgTransition for this state change. The values
 *   for 'staged', 'activated' and 'expired' will be removed from the
 *   recovery configuration record, together with any recCfgTransitions
 *   associated with a previous life cycle.
 * - "REMOVED": There's no such recovery configuration record any more.
 *   The recovery configuration and all the recCfgTransitions associated
 *   with the recovery configuration during its lifetime will be removed.
 */

'use strict';
const assert = require('assert-plus');
const util = require('util');
const VError = require('verror');

const mod_moray = require('../apis/moray');
const validate = require('../util/validate');
const model = require('./model');

const BUCKET = {
    desc: 'Recovery configuration templates',
    name: 'kbmapi_recovery_configs',
    schema: {
        index: {
            uuid: { type: 'uuid', 'unique': true},
            template: { type: 'string' },
            created: { type: 'date' },
            staged: { type: 'date' },
            activated: { type: 'date' },
            expired: { type: 'date' }
        }
    },
    version: 0
};

const CREATE_SCHEMA = {
    required: {
        uuid: validate.UUID,
        template: validate.isPresent
    }
};


function RecoveryConfiguration(params) {
    model.Model.call(this, params);
    this.params = {
        uuid: params.uuid,
        template: params.template,
        created: params.created,
        staged: params.staged,
        activated: params.activated,
        expired: params.expired
    };
}


util.inherits(RecoveryConfiguration, model.Model);

/*
 * Required by moray client implementation in use.
 */
RecoveryConfiguration.prototype.key = function key() {
    return this.params.uuid;
};

RecoveryConfiguration.prototype.batch = function batch() {
    return {
        bucket: BUCKET.name,
        key: this.params.uuid,
        operation: 'put',
        value: this.raw(),
        options: {
            etag: this.etag
        }
    };
};

RecoveryConfiguration.prototype.serialize = function serialize() {
    return {
        uuid: this.params.uuid,
        template: this.params.template,
        created: this.params.created,
        staged: this.params.staged,
        activated: this.params.activated,
        expired: this.params.expired
    };
};

/*
 * Required by moray client implementation in use.
 */
RecoveryConfiguration.prototype.raw = function tokenRaw() {
    var self = this;
    return (Object.assign(self.serialize(), {v: BUCKET.version}));
};

/*
 * See model.create for required parameters
 */
function createRecoveryConfiguration(opts, cb) {
    // model.create will assert for all the expected stuff in opts
    assert.object(opts, 'opts');
    assert.func(cb, 'cb');

    // Ditto for the UUID. Let's just create a repeatable one:
    if (!opts.params.uuid) {
        opts.params.uuid = model.uuid(opts.params.template);
    }
    if (!opts.params.created) {
        opts.params.created = new Date().toISOString();
    }

    var createOpts = Object.assign(opts, {
        createSchema: CREATE_SCHEMA,
        bucket: BUCKET,
        model: RecoveryConfiguration
    });

    model.create(createOpts, cb);
}

/*
 * @param opts {Object}
 * - `moray` {MorayClient}
 * - `key` {String} : uuid of the recovery configuration to update
 * - `etag` {String}: The etag for the original Moray object
 * - `remove` {Boolean} : remove all keys in val from the object (optional)
 * - `val` {Object} : keys to update in the object
 * @param callback {Function} `function (err, new RecoveryConfiguration())`
 */
function updateRecoveryConfiguration(opts, callback) {
    assert.object(opts, 'opts');
    assert.object(opts.val, 'opts.val');
    // On a recovery configuration, the only thing we can do is either remove
    // a value or add new values to staged, activated and expired.
    // Everything else should be forbidden.
    const invalid = Object.keys(opts.val).some(function isNotAllowed(k) {
        return ['staged', 'activated', 'expired'].indexOf(k) === -1;
    });

    if (invalid) {
        callback(new VError('Only  \'staged\', \'activated\' and ' +
            '\'expired\'can be modified for a Recovery Configuration'));
        return;
    }

    getRecoveryConfiguration({
        uuid: opts.key,
        moray: opts.moray,
        model: RecoveryConfiguration
    }, function getCb(getErr, recCfg) {
        if (getErr) {
            callback(getErr);
            return;
        }

        var updateOpts = Object.assign(opts, {
            bucket: BUCKET,
            original: recCfg.raw(),
            etag: opts.etag || recCfg.etag
        });

        model.update(updateOpts, function updateCb(updateErr, updatedVal) {
            if (updateErr) {
                callback(updateErr);
                return;
            }

            const etag = updatedVal.value.etag;
            delete updatedVal.value.etag;

            var obj = new RecoveryConfiguration(updatedVal.value);
            obj.etag = etag;
            callback(null, obj);
        });
    });
}

function getRecoveryConfiguration(opts, callback) {
    assert.object(opts, 'opts');
    assert.func(callback, 'callback');

    var getOpts = Object.assign(opts, {
        bucket: BUCKET,
        model: RecoveryConfiguration,
        key: opts.uuid || (opts.params && opts.params.uuid)
    });
    model.get(getOpts, callback);
}


function deleteRecoveryConfiguration(opts, callback) {
    assert.object(opts, 'opts');
    assert.func(callback, 'callback');

    var delOpts = Object.assign(opts, {
        bucket: BUCKET,
        key: opts.uuid || (opts.params && opts.params.uuid)
    });

    model.del(delOpts, callback);
}


const VALID_FIELDS = [
    'uuid',
    'created',
    'activated',
    'staged',
    'expired',
    'template'
];


function listRecoveryConfigurations(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.moray, 'opts.moray');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.params, 'opts.params');
    assert.func(cb, 'cb');

    model.list(Object.assign(opts, {
        bucket: BUCKET,
        validFields: VALID_FIELDS,
        sort: {
            attribute: 'created',
            order: 'ASC'
        },
        model: RecoveryConfiguration
    }), cb);
}

function initRecoveryConfigurationsBucket(moray, cb) {
    mod_moray.initBucket(moray, BUCKET, cb);
}

module.exports = {
    bucket: function () { return BUCKET; },
    create: createRecoveryConfiguration,
    del: deleteRecoveryConfiguration,
    get: getRecoveryConfiguration,
    update: updateRecoveryConfiguration,
    ls: listRecoveryConfigurations,
    RecoveryConfiguration: RecoveryConfiguration,
    init: initRecoveryConfigurationsBucket
};
// vim: set softtabstop=4 shiftwidth=4:
