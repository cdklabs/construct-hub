# Please bump this version number in your PRs
VERSION := 1.0.0
MAJOR := $(shell echo $(VERSION) | cut -d '.' -f 1)
export MAJOR

# Set the NPM registry to publish the app
NPM_PUBLISH_REGISTRY=https://gdartifactory1.jfrog.io/artifactory/api/npm/npm-godaddy-constructs-cdk-construct-hub-local

.PHONY: init-app
init-app: clean
	npm ci --userconfig=.npmrcCI -f

.PHONY: build-app
build-app: clean bump-version init-app
    # This is the command to build the app which includes linting, testing, and building the app
	yarn build

.PHONY: bump-version
bump-version:
	echo "Using version: $(VERSION)"
	yarn bump

.PHONY: login-npm
login-npm:
	npm login --userconfig=.npmrcCI

# CDK: Publish the app to NPM
.PHONY: publish-app-npm
publish-app-npm: bump-version
	echo "Publishing the app to NPM ($(NPM_PUBLISH_REGISTRY)) with version $(VERSION)"
	npm --verbose publish --registry $(NPM_PUBLISH_REGISTRY) --userconfig=.npmrcCI
	echo "Published the app to NPM!"

# Clean up all the build artifacts
.PHONY:
clean:
	echo "Cleaning up the build artifacts"
	rm -rf dist || true
	rm -rf lib || true
	rm -rf coverage || true
	#rm -rf node_modules || true
	echo "Cleaned up the build artifacts"

# Before creating a PR, run the following commands
.PHONY: pr
pr: clean init-app build-app
