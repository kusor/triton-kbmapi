title: Key Backup and Management API (KBMAPI)
apisections:
markdown2extras: code-friendly
---
<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright 2019 Joyent, Inc.
-->

# Key Backup and Management API (KBMAPI)

The goal of this is to provide an API that will be used to manage the
pivtokens on Triton compute nodes containing encrypted zpools.
The details are largely in [RFD 77](https://github.com/joyent/rfd/blob/master/rfd/0077/README.adoc) still.

The tl;dr is that when a CN boots, it will authenticate itself to KBMAPI,
and then request the pin to unlock its local pivtoken.  Once unlocked, it
can supply the zpool encryption key to allow it to be imported.  It should
also at some point allow for recovery (i.e. replaced pivtoken).


KBMAPI will be a fairly simple and minimal REST service.  API endpoints
provide the means for adding new tokens, removing tokens, recovering tokens
(i.e. replacing a token), as well as providing the PIN of a token to an
authenticated entity.

When a token is added, the KBMAPI service will need to generate a recovery
token (a random blob of data) that will be stored on the CN.  The recovery
token serves two purposes:  First, it is used by the CN as the recovery key
as described in <<prov-backups>>.  Second, it is also used by the CN as a
shared secret with KBMAPI for the purposes of replacing the token information
of a CN with the data from a new token.

### kbmapi-history

When tokens are deleted or reinitialized, the old token data should be kept in a
KBMAPI-maintained history.  This history maintains the token data for an
amount of time defined by the `KBMAPI_HISTORY_DURATION` SAPI variable.  The
default shall be 15 days.  The purpose is to provide a time-limited backup
against accidental token deletion.

#### Attestation

[yubi-attest](https://developers.yubico.com/PIV/Introduction/PIV_attestation.html)

Some tokens have extensions that allow for attestation -- that is a method
to show that a given certificate was created on the device and not imported.
For Yubikeys, this is done by creating a special x509 certificate as detailed
[here](https://developers.yubico.com/PIV/Introduction/PIV_attestation.html).

If an operator wishes to require attestation, they must set the
`KBMAPI_REQUIRE_ATTESTATION` SAPI parameter to `true`.  In addition, the
`KBMAPI_ATTESTATION_CA` SAPI parameter must be set to the CA certificate
used for attestation.

Additionally, an operator may wish to limit the tokens that are allowed to
be used with KBMAPI to a known set of tokens.  To do so, an operator would
set the SAPI parameter `KBMAPI_REQUIRE_TOKEN_PRELOAD` to `true`.  A command
line tool (working name 'kbmapi') is then used by the operator to load the
range of serial numbers into KBMAPI.  This is only supported for tokens that
support attestation (e.g. Yubikeys).  In other words, enabling
`KBMAPI_REQUIRE_TOKEN_PRELOAD` requires `KBMAPI_REQUIRE_ATTESTATION` to also
be enabled (but not necessarily vice versa).

It should be noted that since both the attestation and device serial numbers
are non-standard PIV extensions.  As such support for either feature will
require kbmd / piv-tool and potentially kbmapi to support a particular device's
implementation.  Similarly, enabling the feature requires the use of PIV tokens
that implement the corresponding feature (attestation or a static serial number).
The initial scope will only include support for Yubikey attestation and serial
numbers.

In both cases, enforcement of the policy occurs during the provisioning
process (i.e. at the time of a CreateToken call).  Changes to either policy
do _not_ affect existing tokens in KBMAPI.

#### Token object

The token data needs to be persistently store (for hopefully obvious reasons).
A moray bucket will be used to store the token data. The JSON config of the
bucket will be:

```
{
    "desc": "token data",
    "name": "tokens",
    "schema": {
        "index": {
            "guid": { "type": "string", "unique": true },
            "cn_uuid": { "type": "uuid", "unique": true }
        }
    }
}
```

The token object itself will be represented using JSON similar to:

```
{
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "97496DD1C8F053DE7450CD854D9C95B4",
    "pin": "123456",
    "recovery_tokens": [{
        "created": 123456789,
        "token": "jmzbhT2PXczgber9jyOSApRP337gkshM7EqK5gOhAcg="
    }, {
        "created": 2233445566,
        "token": "QmUgc3VyZSB0byBkcmluayB5b3VyIG92YWx0aW5l"
    }]
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "attestation": {
       "9e": "-----BEGIN CERTIFICATE-----....",
       "9d": "-----BEGIN CERTIFICATE-----....",
       "9a": "-----BEGIN CERTIFICATE-----....."
    }
}
```


**Field**        | **Required** | **Description**
-----------------|--------------|-----------------
model            | No       | The model of the token.
serial           | No       | The serial number of the token (if available).
cn\_uuid         | Yes      | The UUID of the compute node that contains this token.
guid             | Yes      | The GUID of the provisioned token.
pin              | Yes      | The pin of the provisioned token.
recovery\_tokens | Yes      | An array of recovery tokens.  Used to recover the encryption keys of a zpool protected by this token.  Also used when replacing a token.  When the recovery configuration is updated, a new recovery token is generated and added to the list.
pubkeys          | Yes      | A JSON object containing the _public_ keys of the token.
pubkeys.9a       | Yes      | The public key used for authentication after the token has been unlocked.
pubkeys.9d       | Yes      | The public key used for encryption after the token has been unlocked.
pubkeys.9e       | Yes      | The public key used for authenticating the token itself without a pin (e.g. used when requesting the pin of a token).
attestation      | No       | The attestation certificates for the corresponding pubkeys.


Note that when provisioning a token, if any of the optional fields are known,
(e.g. `attestation` or `serial`) they should be supplied during provisioning.

#### Token History

As a failsafe measure, when a token is deleted, the entry from the token
bucket is saved into a history bucket.  This bucket retains up to
`KBMAPI_HISTORY_DURATION` days of token data (see [#kbmapi-history]).

The history bucket looks very similar to the token bucket:

```
{
    "desc": "token history",
    "name": "token_history",
    "schema": {
        "index": {
            "guid": { "type": "string" },
            "cn_uuid": { "type": "uuid" },
            "active_range": { "type": "daterange" }
        }
    }
}
```

The major difference is that the index fields are not unique as well as the
`active_range` index.  An accidentally deleted token that's restored might end
up with multiple history entries, and a CN which has had a token replacement
will also have multiple history entries.

The moray entry in the history bucket also looks similar, but not quite the
same as the token bucket:

```
{
    "active_range": "[2019-01-01 00:00:00, 2019-03-01 05:06:07]",
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "97496DD1C8F053DE7450CD854D9C95B4",
    "pin": "123456",
    "recovery_tokens": [{
        "created": 123456789,
        "token": "jmzbhT2PXczgber9jyOSApRP337gkshM7EqK5gOhAcg="
    }, {
        "created": 2233445566,
        "token": "QmUgc3VyZSB0byBkcmluayB5b3VyIG92YWx0aW5l"
    }],
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "attestation": {
       "9e": "-----BEGIN CERTIFICATE-----....",
       "9d": "-----BEGIN CERTIFICATE-----....",
       "9a": "-----BEGIN CERTIFICATE-----....."
    },
    "comment": ""
}
```

The major difference is the addition of the `active_range` property as well as
the `comment` property. The `active_range` property represents the (inclusive)
start and end dates that the provisioned token was in use.

It's permitted that the same provisioned token might have multiple entries in
the history table.  An example would be a token accidentally deleted and
restored would have an entry for the deletion, and then a second entry when
the token is retired (or reprovisioned).

The `comment` field is an optional field that contains free form text.  It is
intended to note the reason for the deletion.

To protect the token data in Moray, we will rely on the headnode disk
encryption.

**QUESTION**: Even though the HN token will not use the GetTokenPin
API call to obtain its pin, should we still go ahead and store the data for
the HN token in KBMAPI?

#### Preloading Tokens

To support an operator preloading unprovisioned tokens, we track ranges of
serial numbers that are allowed to be provisioned.  We use a separate
moray bucket for tracking these ranges of serial numbers:

```
{
    "desc": "token serials",
    "name": "token_serial",
    "schema": {
        "index": {
            "ca_dn": { "type": "string" },
            "serial_range": { "type": "numrange" }
        }
    }
}
```

The entries looks similar to:

```
{
    "serial_range": "[111111, 123456]",
    "allow": true,
    "ca_dn": "cn=my manf authority",
    "comment": "A useful comment here"
}
```


**Field**     | **Description**
--------------|-----------------
serial\_range | An range of serial numbers.  This range is inclusive.
allow         | Set to true if this range is allowed, or false is this range is blacklisted.
ca\_dn        | The distinguished name (DN) of the attestation CA for this token.  Used to disambiguate any potential duplicate serial numbers between vendors.
comment       | An operator supplied free form comment.


The `kbmadm` command is used to manage this data.

#### Audit Trail

Given the critical nature of the token data, we want to provide an audit
trail of activity.  While there is discussion of creating an AuditAPI at
some point in the future, it currently does not look like it would be available
to meet the current deadlines.  Once available, we should look at the effort
to migrate this functionality to AuditAPI.

In the meantime, we will provide the option of uploading the KBMAPI logs to
a Manta installation using hermes.

### Responses

All response objects are `application/json` encoded HTTP bodies.  In addition,
all responses will have the following headers:


**Header**  | **Description**
------------|-----------------
Date        | When the response wqas send (RFC 1123 format).
Api-Version | The exact version of the KBMAPI server that processed the request.
Request-Id  | A unique id for this request.


If the response contains content, the following additional headers will be
present:


**Header**     | **Description**
---------------|-----------------
Content-Length | How much content, in bytes.
Content-Type   | The format of the response (currently always `application/json`).
Content-MD5    | An MD5 checksum of the response.


#### HTTP Status Codes

KBMAPI will return one of the following codes on an error:

**Code** | **Description**    | **Details**
---------|--------------------|-------------
401      | Unauthorized       | Either no Authorization header was send, or the credentials used were invalid.
405      | Method Not Allowed | Method not supported for the given resource.
409      | Conflict           | A parameter was missing or invalid.
500      | Internal Error     | An unexpected error occurred.


If an error occurs, KBMAPI will return a standard JSON error response object
in the body of the response:

```
{
    "code": "CODE",
    "message": "human readable string"
}
```

Where `code` is one of:


**Code**           | **Description**
-------------------|------------------
BadRequest         | Bad HTTP was sent.
InternalError      | Something went wrong in KBMAPI.
InvalidArgument    | Bad arguments or a bad value for an argument.
InvalidCredentials | Authentication failed.
InvalidHeader      | A bad HTTP header was sent.
InvalidVersion     | A bad `Api-Version` string was sent.
MissingParameter   | A required parameter was missing.
ResourceNotFound   | The resource was not found.
UnknownError       | Something completely unexpected happened.


### KBMAPI Endpoints

These are the proposed endpoints to meet the above requirements.  They largely
document the behavior of the existing KBMAPI prototype (though in a few places
describe intended behavior not yet present in the prototype).

In each case, each request should include an `Accept-Version` header indicating
the version of the API being requested.  The initial value defined here shall
be '1.0'.

#### CreateToken (POST /pivtokens)

Add a new initialized PIV token.  Included in the request should be an
`Authorization` header with a method of 'Signature' with the date header
signed using the token's `9e` key.  The payload is a JSON object with the
following fields:


**Field**   | **Required** | **Description**
------------|--------------|-----------------
guid        | Yes          | The GUID of the provisioned token.
cn\_uuid    | Yes          | The UUID if the CN that contains this token.
pin         | Yes          | The pin for the token generated during provisioning.
model       | No           | The model of the token (if known).
serial      | No           | The serial number of the token (if known).
pubkeys     | Yes          | The public keys of the token generated during provisioning.
pubkeys.9a  | Yes          | The `9a` public key of the token.
pubkeys.9d  | Yes          | The `9d` public key of the token.
pubkeys.9e  | Yes          | The `9e` public key of the token.
attestation | No           | The attestation certificates corresponding to the `9a`, `9d`, and `9e` public keys.


Note: for the optional fields, they should be supplied with the request when
known.  Unfortunately, there is no simple way to enforce this optionality on
the server side, so we must depend on the CN to supply the optional data
when appropriate.

If the signature check fails, a 401 Unauthorized error + NotAuthorized code
is returned.

If any of the required fields are missing, a 409 Conflict + InvalidArgument
error is returned.

If the `guid` or `cn_uuid` fields contain a value already in use in the
`tokens` bucket, a new entry is _not_ created.  Instead, the `9e` public key
from the request is compared to the `9e` key in the stored token data.  If
the keys match, and the signature check succeeds, then the `recovery_token`
value of the existing entry is returned and a 200 response is returned. This
allows the CN to retry a request in the event the response was lost.

If the `9e` key in the request does not match the `9e` key for the existing
token in the `tokens` bucket, but either (or both) the `guid` or `cn_uuid`
fields match an existing entry, a 409 Conflict + NotAuthorized error
is returned.  In such an instance, an operator must manually verify if the
information in the token bucket is out of date and manually delete it before
the token provisioning can proceed.

If an operator has hardware with duplicate UUIDs, they must contact
their hardware vendor to resolve the situation prior to attempting to provision
the PIV token on the system with a duplicate UUID.  While we have seen such
instances in the past, they are now fairly rare.  Our past experience has
shown that attempting to work around this at the OS and Triton level is
complicated and prone to breaking.  Given what is at stake in terms of the
data on the system, we feel it is an unacceptable risk to try to work around
such a situation (instead of having the hardware vendor resolve it).

If the request does not generate any of the above errors, the request is
If the attestation section is supplied, the attestation certs _must_ agree
with the pubkeys supplied in the request.  If they do not agree, or if
`KBMAPI_ATTESTATION_REQUIRED` is true and no attestation certs are provided, a
409 Conflict + InvalidArgument error is returned.

If `KBMAPI_REQUIRE_TOKEN_PRELOAD` is `true`, the serial number of
the token as well as the attestation certificates of the token in question
must be present in the CreateToken request.  KBMAPI performs a search for
a range of allowed serial numbers in the `token_serial` bucket whose
attestation CA DN matches the attestation CA of the token in the request.
If the serial number is not part of an allowed range, a
409 Conflict + InvalidArgument error is returned.

In addition, a `recovery_token` is generated by KBMAPI and stored as part of the
token object.  This should be a random string of bytes generated by a random
number generator suitable for cryptographic purposes.

Once the entry is updated or created in moray, a successful response is
returned (201) and the generated recovery token is included in the response.

Example request (with attestation)

```
POST /pivtokens
Host: kbmapi.mytriton.example.com
Date: Thu, 13 Feb 2019 20:01:02 GMT
Authorization: Signature <Base64(rsa(sha256($Date)))>
Accept-Version: ~1
Accept: application/json

{
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "97496DD1C8F053DE7450CD854D9C95B4",
    "pin": "123456",
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "attestation": {
       "9e": "-----BEGIN CERTIFICATE-----....",
       "9d": "-----BEGIN CERTIFICATE-----....",
       "9a": "-----BEGIN CERTIFICATE-----....."
    }
}
```

An example response might look like:

```
HTTP/1.1 201 Created
Location: /pivtokens/97496DD1C8F053DE7450CD854D9C95B4
Content-Type: application/json
Content-Length: 12345
Content-MD5: s5ROP0dBDWlf5X1drujDvg==
Date: Fri, 15 Feb 2019 12:34:56 GMT
Server: Joyent KBMAPI 1.0
Api-Version: 1.0
Request-Id: b4dd3618-78c2-4cf5-a20c-b822f6cd5fb2
Response-Time: 42


{
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "97496DD1C8F053DE7450CD854D9C95B4",
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "recovery_tokens": [
        {
            created: 1563348710384,
            token: 'cefb9c2001b535b697d5a13ba6855098e8c58feb800705092db061343bb7daa10e52a97ed30f2cf1'
        }
    ]
}
```

In order to make the request/response retry-able w/o generating and saving a new
`recovery_token` each time (to prevent a single recovery configuration update
from creating multiple `recovery_tokens` due to network/retry issues), any
requests made after the initial token creation to the same `Location` (i.e.
`POST /pivtokens/:guid`) will result into the same pivtoken object being
retrieved.

This can be used too in order to generate new recovery tokens when a request is
made at a given time after `recovery_token` creation. This time interval will
be configurable in SAPI through the variable `KBMAPI_RECOVERY_TOKEN_DURATION`.
By default, this value will be set to 1 day.

When the `POST` request is received for an existing pivtoken, KBMAPI will
verify the antiquity of the newest member of `recovery_tokens` and in case it
exceeds the aforementioned `KBMAPI_RECOVERY_TOKEN_DURATION` value, it will
generate a new `recovery_token`.

On all of these cases, the status code will be `200 Ok` instead of the
`201 Created` used for the initial pivtoken creation.

#### UpdateToken (PUT /pivtokens/:guid)

Update the current fields of a token.  Currently, the only field that can be
altered is the `cn_uuid` field (e.g. during a chassis swap).  If the new
`cn_uuid` field is already associated with an assigned token, or if any of
the remaining fields differ, the update fails.

This request is authenticated by signing the Date header with the token's 9e
key (same as CreateToken).  This however does not return the recovery token
in it's response.

Example request:

```
PUT /pivtokens/97496DD1C8F053DE7450CD854D9C95B4
Host: kbmapi.mytriton.example.com
Date: Thu, 13 Feb 2019 20:01:02 GMT
Authorization: Signature <Base64(rsa(sha256($Date)))>
Accept-Version: ~1
Accept: application/json

{
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "99556402-3daf-cda2-ca0c-f93e48f4c5ad",
    "guid": "97496DD1C8F053DE7450CD854D9C95B4",
    "pin": "123456",
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "attestation": {
       "9e": "-----BEGIN CERTIFICATE-----....",
       "9d": "-----BEGIN CERTIFICATE-----....",
       "9a": "-----BEGIN CERTIFICATE-----....."
    }
}
```

Example response:

```
HTTP/1.1 200 OK
Location: /pivtokens/97496DD1C8F053DE7450CD854D9C95B4
Content-Type: application/json
Content-Length: 1122
Content-MD5: s5ROP0dBDWlf5X1drujDvg==
Date: Sun, 17 Feb 2019 10:27:43 GMT
Server: Joyent KBMAPI 1.0
Api-Version: 1.0
Request-Id: 7e2562ba-731b-c91b-d7c6-90f2fd2d36a0
Response-Time: 23
```

#### RecoverToken (POST /pivtokens/:guid/recover)

When a token is no longer available (lost, damaged, accidentally reinitialized,
etc.), a recovery must be performed.  This allows a new token to replace the
unavailable token.  When a recovery is required, an operator initiates the
recovery process on the CN.  This recovery process on the CN will decrypt the
current `recovery_token` value for the lost token that was created during the
lost token's CreateToken request or a subsequent `CreateToken` request.
For some TBD amount of time, earlier `recovery_token` values may also be allowed
to account for propagation delays when updating recovery configurations using
changefeed. KBMAPI may also optionally periodically purge members of
a token's `recovery_tokens` array that are sufficiently old to no longer
be considered valid (even when accounting for propagation delays).

The CN submits a RecoverToken request to replace the unavailable token
with a new token.  The `:guid` parameter is the guid of the unavailable token.
The data included in the request is identical to that of a CreateToken request.
The major difference is that instead of using a token's 9e key to sign the date
field, the decrypted `recovery_token` value is used as the signing key.

Instead of HTTP Signature auth using the SSH key, HMAC signature using the
`recovery_token` as value will be used.

If the lost token does not exists in KBMAPI we should reject the request with
a `404 Not Found` response.

If the request fails the authentication requests, a `401 Unauthorized` error
is returned.

If all the checks succeed, the information from the old token (`:guid`) is
moved to a history entry for that token. Any subsequent requests to
`/pivtokens/:guid` should either return a `404 Not found` reply. Note we do
not try to return a `301 Moved Permanently` response with a new pivtoken
location because we could have a request to a pivtoken which has already been
replaced by another, which in turn has been replaced by another one ...

The newly created token will then be returned, together with the proper
`Location` header (`/pivtokens/:new_guid`). In case of network/retry issues,
additional attempts to retrieve the new pivtoken information should be made
through `CreateToken` end-point for the new token, and these requests should
be signed by the new token 9e key, instead of using HMAC with the old token
`recovery_token`.

An example request:

```
POST /pivtokens/97496DD1C8F053DE7450CD854D9C95B4/recover
Host: kbmapi.mytriton.example.com
Date: Thu, 13 Feb 2019 20:01:02 GMT
Authorization: Signature <Base64(rsa(sha256($Date)))>
Accept-Version: ~1
Accept: application/json

{
    "model": "Yubico Yubikey 4",
    "serial": 6324923,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "75CA077A14C5E45037D7A0740D5602A5",
    "pin": "424242",
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "attestation": {
       "9e": "-----BEGIN CERTIFICATE-----....",
       "9d": "-----BEGIN CERTIFICATE-----....",
       "9a": "-----BEGIN CERTIFICATE-----....."
    }
}
```

And an example response:

```
HTTP/1.1 201 Created
Location: /pivtokens/75CA077A14C5E45037D7A0740D5602A5
Content-Type: application/json
Content-Length: 12345
Content-MD5: s5ROP0dBDWlf5X1drujDvg==
Date: Fri, 15 Feb 2019 12:54:56 GMT
Server: Joyent KBMAPI 1.0
Api-Version: 1.0
Request-Id: 473bc7f4-05cf-4edb-9ef7-8b61cdd8e6b6
Response-Time: 42

{
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "75CA077A14C5E45037D7A0740D5602A5",
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "recovery_tokens": [
        {
            created: 1563348710384,
            token: 'cefb9c2001b535b697d5a13ba6855098e8c58feb800705092db061343bb7daa10e52a97ed30f2cf1'
        }
    ]
}
```

Note that the location contains the guid of the _new_ token.


#### ListTokens (GET /pivtokens)

Gets all provisioned pivtokens.  The main requirement here is no
sensitive information of a token is returned in the output.

Filtering by at least the `cn_uuid` as well as windowing functions should be
supported.

An example request:

```
GET /pivtokens
Host: kbmapi.mytriton.example.com
Date: Wed, 12 Feb 2019 02:04:45 GMT
Accept-Version: ~1
Accept: application/json
```

An example response:

```
HTTP/1.1 200 Ok
Location: /pivtokens
Content-Type: application/json
Content-Length: 11222333
Content-MD5: s5ROP0dBDWlf5X1drujDvg==
Date: Wed, 12 Feb 2019 02:04:45 GMT
Server: Joyent KBMAPI 1.0
Api-Version: 1.0
Request-Id: af32dafe-b9ed-c2c1-b5e5-f5fefc40aba4
Response-Time: 55

{
    [
        {
            "model": "Yubico Yubikey 4",
            "serial": 5213681,
            "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
            "guid": "97496DD1C8F053DE7450CD854D9C95B4"
            "pubkeys": {
               "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
               "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
               "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
            }
        },
        {
            "model": "Yubico Yubikey 5",
            "serial": 12345123,
            "cn_uuid": "e9498ab2-d6d8-ca61-b908-fb9e2fea950a",
            "guid": "75CA077A14C5E45037D7A0740D5602A5",
            "pubkeys": {
               "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
               "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
               "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
            }
        },
        ....
    ]
}
```

#### GetToken (GET /pivtokens/:guid)

Gets the public info for a specific token.  Only the public fields are
returned.

Example request:

```
GET /pivtokens/97496DD1C8F053DE7450CD854D9C95B4
Host: kbmapi.mytriton.example.com
Date: Wed, 12 Feb 2019 02:10:32 GMT
Accept-Version: ~1
Accept: application/json
```

Example response:

```
HTTP/1.1 200 Ok
Location: /pivtokens/97496DD1C8F053DE7450CD854D9C95B4
Content-Type: application/json
Content-Length: 12345
Content-MD5: s5REP1dBDWlf5X1drujDvg==
Date: Wed, 12 Feb 2019 02:10:35 GMT
Server: Joyent KBMAPI 1.0
Api-Version: 1.0
Request-Id: de02d045-f8df-cf51-c424-a21a7984555b
Response-Time: 55

{
   "model": "Yubico Yubikey 4",
   "serial": 5213681,
   "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
   "guid": "97496DD1C8F053DE7450CD854D9C95B4"
   "pubkeys": {
      "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
      "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
      "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
   }
}
```

#### GetTokenPin (GET /pivtokens/:guid/pin)

Like GetToken, except it also includes the `pin`.  The `recovery_token` field
is *not* returned.  This request must be authenticated using the 9E key of the
token specified by `:guid` to be successful.  An `Authorization` header should
be included in the request, the value being the signature of the `Date` header
(very similar to how CloudAPI authenticates users);

This call is used by the CN during boot to enable it to unlock the other
keys on the token.

An example request:

```
GET /pivtokens/97496DD1C8F053DE7450CD854D9C95B4/pin
Host: kbmapi.mytriton.example.com
Date: Wed, 12 Feb 2019 02:11:32 GMT
Accept-Version: ~1
Accept: application/json
Authorization: Signature <Base64(rsa(sha256($Date)))>
```

An example reply:

```
HTTP/1.1 200 OK
Location: /pivtokens/97496DD1C8F053DE7450CD854D9C95B4/pin
Content-Type: application/json
Content-Length: 2231
Date: Thu, 13 Feb 2019 02:11:33 GMT
Api-Version: 1.0
Request-Id: 57e46450-ab5c-6c7e-93a5-d4e85cd0d6ef
Response-Time: 1

{
    "model": "Yubico Yubikey 4",
    "serial": 5213681,
    "cn_uuid": "15966912-8fad-41cd-bd82-abe6468354b5",
    "guid": "97496DD1C8F053DE7450CD854D9C95B4",
    "pin": "123456",
    "pubkeys": {
       "9e": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9d": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA...",
       "9a": "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYA..."
    },
    "attestation": {
       "9e": "-----BEGIN CERTIFICATE-----....",
       "9d": "-----BEGIN CERTIFICATE-----....",
       "9a": "-----BEGIN CERTIFICATE-----....."
    }
}
```

#### DeleteToken (DELETE /pivtokens/:guid)

Deletes information about a pivtoken.  This would be called during the
decommission process of a CN.  The request is authenticated using the 9e
key of the token.

Sample request:

```
DELETE /pivtokens/97496DD1C8F053DE7450CD854D9C95B4 HTTP/1.1
Host: kbmapi.mytriton.example.com
Accept: application/json
Authorization: Signature <Base64(rsa(sha256($Date)))>
Api-Version: ~1
Content-Length: 0
```

Sample response:

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, Api-Version, Response-Time
Access-Control-Allow-Methods: GET, HEAD, POST, DELETE
Access-Control-Expose-Headers: Api-Version, Request-Id, Response-Time
Connection: Keep-Alive
Date: Thu, 21 Feb 2019 11:26:19 GMT
Server: Joyent KBMAPI 1.0.0
Api-Version: 1.0.0
Request-Id: f36b8a41-5841-6c05-a116-b517bf23d4ab
Response-Time: 997
```

Note: alternatively, an operator can manually run kbmadm to delete an entry.

A destroyed token is automatically added to `token_history`.

## Development status

- Not yet implemented authentication using `recovery_token` for `RecoverToken`.
- Tokens should be moved into history once those have been _recovered_.
- `token_serial` bucket needs to be created and end-point to access tokens
  serial should be provided.
- SAPI configuration for attestation is not present and none of the associated
  functionalities implemented.
