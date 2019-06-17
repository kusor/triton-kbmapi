/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018, Joyent, Inc.
 */

/*
 * Error classes and helpers
 */

'use strict';

var assert = require('assert-plus');
var constants = require('./constants');
var restify = require('restify');
var util = require('util');



// --- Globals



var MSG = {
    duplicate: 'Already exists',
    internal: 'Internal error',
    missingParam: 'Missing parameter',
    missingParams: 'Missing parameters'
};



// --- Error classes



/**
 * Base class for an internal server error
 */
function InternalError(cause, message) {
    assert.object(cause, 'cause');
    assert.optionalString(message, 'message');

    if (!message) {
        message = MSG.internal;
    }

    restify.InternalServerError.call(this, {
        cause: cause,
        message: message,
        restCode: 'InternalError',
        body: {
            code: 'InternalError',
            message: message
        }
    });
}

util.inherits(InternalError, restify.InternalServerError);


/**
 * Base class for invalid / missing parameters
 */
function InvalidParamsError(message, errors) {
    assert.string(message, 'message');
    assert.arrayOfObject(errors, 'errors');

    restify.RestError.call(this, {
        restCode: 'InvalidParameters',
        statusCode: 422,
        message: message,
        body: {
            code: 'InvalidParameters',
            message: message,
            errors: errors
        }
    });

    this.name = 'InvalidParamsError';
}

util.inherits(InvalidParamsError, restify.RestError);


/**
 * Base class for errors due to resources in use
 */
function InUseError(message, errors) {
    assert.string(message, 'message');
    assert.arrayOfObject(errors, 'errors');

    restify.InvalidArgumentError.call(this, {
        restCode: 'InUse',
        statusCode: 422,
        message: message,
        body: {
            code: 'InUse',
            message: message,
            errors: errors
        }
    });

    this.name = 'InUseError';
}

util.inherits(InUseError, restify.InvalidArgumentError);


/*
 * Helper for sorting an array of objects by their "id" field.
 */
function sortById(a, b) {
    if (a.id < b.id) {
        return -1;
    } else if (a.id > b.id) {
        return 1;
    } else {
        return 0;
    }
}


/*
 * Error response for duplicate parameters
 */
function duplicateParam(field, message) {
    assert.string(field, 'field');

    return {
        field: field,
        code: 'Duplicate',
        message: message || MSG.duplicate
    };
}


/**
 * Error response for invalid parameters
 */
function invalidParam(field, message, extra) {
    assert.string(field, 'field');

    var param = {
        field: field,
        code: 'InvalidParameter',
        message: message || constants.msg.INVALID_PARAMS
    };

    if (extra) {
        for (var e in extra) {
            param[e] = extra[e];
        }
    }

    return param;
}

/**
 * Error response for unknown parameters
 */
function unknownParams(params, message, extra) {
    var msg;

    assert.arrayOfString(params, 'params');
    assert.optionalString(message, 'message');
    assert.optionalObject(extra, 'extra');

    msg = message || constants.msg.UNKNOWN_PARAMS;
    msg += ': ' + params.join(', ');

    var param = {
        field: params,
        code: 'UnknownParameters',
        message: msg
    };

    if (extra) {
        for (var e in extra) {
            if (!extra.hasOwnProperty(e)) {
                continue;
            }
            param[e] = extra[e];
        }
    }

    return param;
}


/**
 * Error response for missing parameters
 */
function missingParam(field, message) {
    assert.string(field, 'field');

    return {
        field: field,
        code: 'MissingParameter',
        message: message || MSG.missingParam
    };
}


/**
 * Error response for an item in use
 */
function usedBy(type, id, message) {
    assert.string(type, 'type');
    assert.string(id, 'id');

    return {
        type: type,
        id: id,
        code: 'UsedBy',
        message: message || util.format('In use by %s "%s"', type, id)
    };
}


/**
 * Error response for a parameter in use
 */
function usedByParam(field, type, id, message) {
    assert.string(field, 'field');
    var paramErr = usedBy(type, id, message);
    paramErr.field = field;
    return paramErr;
}

function sortErrsByField(errs) {
    assert.arrayOfObject(errs, 'errs');
    errs.sort(function (a, b) {
        if (a.field < b.field) {
            return -1;
        }
        if (a.field > b.field) {
            return 1;
        }
        return 0;
    });
}


module.exports = {
    duplicateParam: duplicateParam,
    InternalError: InternalError,
    invalidParam: invalidParam,
    InvalidParamsError: InvalidParamsError,
    InUseError: InUseError,
    sortById: sortById,
    missingParam: missingParam,
    msg: MSG,
    unknownParams: unknownParams,
    usedBy: usedBy,
    usedByParam: usedByParam,
    sortErrsByField: sortErrsByField
};
