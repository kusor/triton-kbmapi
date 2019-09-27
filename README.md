<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright 2019 Joyent, Inc.
-->

# triton-kbmapi: An Earth-shattering key backup and management service

This repository is part of the Joyent Triton project. See the [contribution
guidelines](https://github.com/joyent/triton/blob/master/CONTRIBUTING.md) --
*Triton does not use GitHub PRs* -- and general documentation at the main
[Triton project](https://github.com/joyent/triton) page.

## Development

This is an incomplete work in progress of a proof of concept.  You have
been warned.

    make all

## Test

    make test

Note you need PostgreSQL installed on the machine you're running the tests from
due to [node-moray-sandbox](https://github.com/joyent/node-moray-sandbox). See
that repo's README for the details.

Unit tests can also run with:

    npm run-script test

and a similar command can be used to run tests with code coverage:

    npm run-script coverage

Given there are some warnings being printed out by one of the dependencies,
another way to run the whole set of unit tests including code coverage is

    make test 2> /dev/null

then, getting code coverage results is as simple as:

    open coverage/lcov-report/index.html

## Installation

To warn again, this is a work in progress prototype.  You should **not** attempt
to install this on any Triton installation that you are not prepared to wipe
(including all instances) and reinstall from scratch.  Nor should you use it
to protect any data you care about at this time (it's still in development).
You have been warned twice now!

The easiest way is to upgrade sdcadm to an experimental image containing the
KBMAPI install code:

    sdcadm self-update -C experimental 4f792e1c-cd8f-11e8-b270-abdc411647b9

NOTE: The sdcadm image UUID may change as updates are made to the KBMAPI update
code, or as the KBMAPI branch is rebased from master.  I'll try to keep this
updated with the last built image during the initial development.  Once we
release this for real, it is expected the normal Triton update procedures
should be all that's necessary.

Then run the KBMAPI post-setup:

    sdcadm post-setup kbmapi -C experimental

That should grab that most recently built KBMAPI image.  Once that completes,
you should have a kbmapi0 zone on your HN.

## Updates

You should be able to update using sdcadm:

    sdcadm update -C experimental kbmapi

## Uninstall

Use this at your own risk!

    scp tools/obliterate-kbmapi-service.sh headnode:/var/tmp
    ssh headnode touch /lib/sdc/.sdc-test-no-production-data
    ssh headnode /var/tmp/obliterate-kbmapi-service.sh

## Documentation

Docs would be nice... There's a basic description of the current API in docs/.
That is _all_ subject to change, and should not be considered final at this time.

To update the guidelines, edit "docs/index.md" and run `make docs`
to update "docs/index.html". Works on either SmartOS or Mac OS X.


## License

"triton-kbmapi" is licensed under the
[Mozilla Public License version 2.0](http://mozilla.org/MPL/2.0/).
See the file LICENSE.
