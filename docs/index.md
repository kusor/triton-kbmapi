title: Key Backup and Management API (KBMAPI)
apisections: Usage
markdown2extras: code-friendly
---
<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright 2018, Joyent, Inc.
-->

# Key Backup and Management API (KBMAPI)

* The goal of this is to provide an API that will be used to manage the pivtokens on Triton compute nodes containing encrypted zpools.  The details are largely in RFD77 still.  This will be expanded more as time goes on (and flushed out more prior to this 'going live').

The tl;dr is that when a CN boots, it will authenticate itself to KBMAPI, and then request the pin to unlock its local pivtoken.  Once unlocked, it can supply the zpool encryption key to allow it to be imported.  It should also at some point allow for recovery (i.e. replaced pivtoken).

# Usage

As this is still a work in progress, this is all subject to change with no notice.  Once 'live' changes will be treated like other Triton APIs in terms of backwards compatibility, breaking changes, etc.

XXX Probably should include some sample JSON of what the token output looks like
.

## CreateToken (POST /pivtokens)

Add a new PIV token.  Must include the `cn_uuid` field and likely some other fields.

## ListTokens (GET /pivtokens)

Gets all the known pivtokens.  The fields included in the response will only include the *public* fields (i.e. no pins).  Things like limit and offset
for windowing will be supported, as well as filtering on things like `cn_uuid`.

## GetToken (GET /pivtokens/:guid)

Gets the public info for a given token.

## GetTokenPin (GET /pivtokens/:guid/pin)

Like GetToken, except it also includes the private fields (e.g. the pin).  This will require authentication using the 9e public key of the token.  Probably something similar to other APIs where it will sign something we provide with it's 93 key.

## DeleteToken (DELETE /pivtokens/:guid)

Deletes information about a pivtoken -- will probably need more thought as to when this can happen and what sort of auth is required (if we even keep this).

## More stuff..

Probably some endpoints around key recovery...
