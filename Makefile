#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2018, Joyent, Inc.
#

#
# KBMAPI Makefile
#

#
# Tools
#

ISTANBUL	:= node_modules/.bin/istanbul
FAUCET		:= node_modules/.bin/faucet

# Makefile.defs defines variables used as part of the build process.
#
include ./tools/mk/Makefile.defs

#
# Configuration used by Makefile.defs and Makefile.targ to generate
# "check" and "docs" targets.
#
DOC_FILES		= index.md boilerplateapi.md
JSON_FILES		= package.json
JS_FILES		:= $(shell find lib test -name '*.js') tools/bashstyle
JSL_FILES_NODE	= $(JS_FILES)
JSSTYLE_FILES	= $(JS_FILES)
JSSTYLE_FLAGS	= -o indent=2,doxygen,unparenthesized-return=0,strict-indent=true
ESLINT			= ./node_modules/.bin/eslint
ESLINT_FILES	= $(JS_FILES)

#BASH_FILES		:= sbin/kbmapid bin/kbmctl
JSL_CONF_NODE =		tools/jsl.node.conf
JSSTYLE_FLAGS =		-f tools/jsstyle.conf

#
# Configuration used by Makefile.smf.defs to generate "check" and "all" targets
# for SMF manifest files.
#
SMF_MANIFESTS_IN =	smf/manifests/kbmapi.xml.in
include ./tools/mk/Makefile.smf.defs

NODE_PREBUILT_VERSION =	v6.14.3
ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_VERSION =	v6.14.3
	# triton-origin-multiarch-18.1.0@1.0.1
	NODE_PREBUILT_IMAGE=b6ea7cb4-6b90-48c0-99e7-1d34c2895248
	NODE_PREBUILT_TAG := zone
	include ./tools/mk/Makefile.node_prebuilt.defs
else
	NPM=npm
	NODE=node
	NPM_EXEC=$(shell which npm)
	NODE_EXEC=$(shell which node)
endif

#
# Makefile.node_modules.defs provides a common target for installing modules
# with NPM from a dependency specification in a "package.json" file.  By
# including this Makefile, we can depend on $(STAMP_NODE_MODULES) to drive "npm
# install" correctly.
#
include ./tools/mk/Makefile.node_modules.defs

#
# Configuration used by Makefile.manpages.defs to generate manual pages.
# See that Makefile for details.  MAN_SECTION must be eagerly defined (with
# ":="), but the Makefile can be used multiple times to build manual pages for
# different sections.
#
MAN_INROOT =		docs/man
MAN_OUTROOT =		man
CLEAN_FILES +=		$(MAN_OUTROOT)

MAN_SECTION :=		1
include tools/mk/Makefile.manpages.defs
MAN_SECTION :=		3bapi
include tools/mk/Makefile.manpages.defs


#
# Repo-specific targets
#
.PHONY: all
all: $(SMF_MANIFESTS) $(STAMP_NODE_MODULES) $(GO_TARGETS) | $(REPO_DEPS)

$(ISTANBUL): | $(NPM_EXEC)
	$(NPM) install

$(FAUCET): | $(NPM_EXEC)
	$(NPM) install

CLEAN_FILES += ./node_modules/tape

.PHONY: test
test: $(ISTANBUL) $(FAUCET)
	$(NODE) $(ISTANBUL) cover --print none test/unit/run.js | $(FAUCET)

#
# Target definitions.  This is where we include the target Makefiles for
# the "defs" Makefiles we included above.
#

include ./tools/mk/Makefile.deps

ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
endif

include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.node_modules.targ
include ./tools/mk/Makefile.targ

sdc-scripts: deps/sdc-scripts/.git
