var Funnel          = require('broccoli-funnel'),
    concat          = require('broccoli-concat'),
    less            = require('broccoli-less-single'),
    mergeTrees      = require('broccoli-merge-trees'),
    ngTemplate      = require('broccoli-angular-templates-cache'),
    ngAnnotate      = require('broccoli-ng-annotate'),
    htmlMinify      = require('broccoli-htmlmin'),
    liveReload      = require('broccoli-inject-livereload'),
    jshint          = require('broccoli-jshint'),
    jscs            = require('broccoli-jscs'),
    csslint         = require('broccoli-csslint'),
    uglifyJs        = require('broccoli-uglify-js'),
    imagemin        = require('broccoli-imagemin'),
    fingerprint     = require('broccoli-asset-rev'),
    amdNameResolver = require('amd-name-resolver').moduleResolve,
    amdLoader       = require('broccoli-amd-loader'),
    Babel           = require('broccoli-babel-transpiler'),
    unitTest        = require('broccoli-karma-plugin'),
    writeFile       = require('broccoli-file-creator'),
    chalk           = require('chalk'),
    _               = require('lodash'),
    configLoader    = require('./config-loader');

module.exports = AngularApp;

function AngularApp (options) {
    this.vendorScripts = [];
    this.vendorStyles  = [];
    this.options       = AngularApp.initOptions(options);
    this.env           = AngularApp.env();
    this.isTesting     = AngularApp.isTesting();
    this.isServing     = AngularApp.isServing();
    this.isProduction  = this.env === 'production';
    this.appConfig     = configLoader(this.env, true);
}

AngularApp.env = function () {
    var env = process.env.ANGULAR_ENV || 'development';

    console.log('Building app for environment: ' + chalk.green(env));

    return env;
};

AngularApp.isServing = function () {
    return !!process.env.ANGULAR_SERVER;
};

AngularApp.isTesting = function () {
    return !!process.env.ANGULAR_TEST;
};

AngularApp.initOptions = function (options) {
    var config = {
        polyfill: false
    };

    return _.merge(config, options);
};

AngularApp.prototype.configTree = function () {
    var config = this.appConfig,
        header = 'export default JSON.parse(\'',
        footer = '\');';

    config = writeFile('/config/environment.js', header + config + footer);
    config = new Babel(config, {
        moduleIds           : true,
        modules             : 'amdStrict',
        resolveModuleSource : amdNameResolver,
        sourceRoot          : 'config'
    });

    return config;
};

AngularApp.prototype.angularTree = function () {
    var angular = new Funnel('bower_components/angular/', {
            include: ['angular.js']
        }),
        shim = new Funnel('bower_components/angular-shim/dist', {
            include: ['angular-shim.amd.js']
        });

    return mergeTrees([angular, shim, this.configTree()]);
};

AngularApp.prototype.appScriptTree = function () {
    return new Funnel('app', {
        include: ['**/*.js'],
        destDir: 'app'
    });
};

AngularApp.prototype.templateTree = function () {
    return new Funnel(mergeTrees(['app', this.addonsTree()]), {
        include: ['**/*.html'],
        exclude: ['index.html'],
        destDir: 'app'
    });
};

AngularApp.prototype.htmlTree = function () {
    return new Funnel('./index.html', {
        destDir: '/index.html'
    });
};

AngularApp.prototype.appStyleTree = function () {
    return new Funnel('styles', {
        include: ['**/*.less'],
        destDir: 'styles'
    });
};

AngularApp.prototype.assetsTree = function () {
    return new Funnel('assets', {
        destDir: 'assets'
    });
};

AngularApp.prototype.addonsTree = function () {
    var bowerConfig = require(process.cwd() + '/bower.json'),
        addons      = [];

    for (var dep in bowerConfig.dependencies) {
        if (dep.substr(0, 12) !== 'angular-bro-') {
            continue;
        }

        addons.push(new Funnel('bower_components/' + dep + '/app/', {
            exclude: ['app.js', 'router.js'],
            destDir: 'app/'
        }));
    }

    return mergeTrees(addons);
};

AngularApp.prototype.appTestsTree = function () {
    var testScripts = new Funnel('tests', {
            include: [ '**/*.spec.js', 'helpers/**/*.js' ],
            destDir: 'tests'
        }),
        testHelpers = new Funnel('bower_components/angular-mocks/', {
            include: [ 'angular-mocks.js' ],
            destDir: 'tests'
        });

    return mergeTrees([testScripts, testHelpers]);
};

AngularApp.prototype.babelPolyfillTree = function () {
    var babelPath = require.resolve('broccoli-babel-transpiler'),

    babelPath = babelPath.replace(/\/index.js$/, '') + '/node_modules/babel-core';

    return new Funnel(babelPath, {
        files: ['browser-polyfill.js']
    });
};

AngularApp.prototype.processAngularTemplates = function (templates) {
    templates = ngTemplate(templates, {
        moduleName : 'templates-app',
        fileName   : 'templates.js',
        srcDir     : './',
        destDir    : 'scripts',
        strip      : 'app/',
        minify     : {
            removeComments      : true,
            collapseWhitespace  : true,
            remoteTagWhitespace : true
        }
    });

    templates = concat(templates, {
        outputFile : 'scripts/templates.js',
        header     : 'angular.module("templates-app", []);',
        inputFiles : [ '**/*.js' ]
    });

    return templates;
};

AngularApp.prototype.processVendorScripts = function () {
    var angular       = this.angularTree(),
        vendorScripts = this.aggregateVendorDependencies(this.vendorScripts, 'scripts/vendor.js'),
        polyfill      = [];

    if (this.options.polyfill === true) {
        polyfill.push(this.babelPolyfillTree());
    }

    vendorScripts = mergeTrees(polyfill.concat([angular, vendorScripts]));
    vendorScripts = amdLoader(vendorScripts, { destDir: 'scripts' });
    vendorScripts = concat(vendorScripts, {
        outputFile  : 'scripts/vendor.js',
        headerFiles : ['scripts/loader.js', 'angular.js', 'angular-shim.amd.js'],
        inputFiles  : ['**/*.js'],
        footerFiles : ['scripts/vendor.js']
    });

    return vendorScripts;
};

AngularApp.prototype.processVendorStyles = function () {
    var vendorStyles = this.aggregateVendorDependencies(this.vendorStyles, 'styles/vendor.css');

    vendorStyles = concat(vendorStyles, {
        inputFiles: ['**/*.css'],
        outputFile: 'styles/vendor.css'
    });

    return vendorStyles;
};

AngularApp.prototype.runLinter = function (appScriptsTree, appStylesTree) {
    var appScripts   = new Funnel(appScriptsTree, {
            exclude: ['scripts/templates.*']
        }),
        lintScripts = jshint(appScripts, {
            testGenerator: function (relativePath, errors) {
                return 'describe("' + relativePath + '", function () {\n' +
                    '    it("should pass jshint.", function () {\n' +
                    '        expect(' + errors + ').toBe(true);\n' +
                    '    });\n' +
                    '});\n';
            }
        }),
        styleScripts = jscs(appScripts, {
            testGenerator: function (relativePath, errors) {
                return 'describe("' + relativePath + '", function () {\n' +
                    '    it("should pass jscs.", function () {\n' +
                    '        expect(' + !!errors + ').toBe(false);\n' +
                    '    });\n' +
                    '});\n';
            }
        }),
        lintStyles = csslint(appStylesTree);

    return new Funnel(mergeTrees([lintScripts, styleScripts, lintStyles], { overwrite: true }), {
        destDir: 'tests/lint'
    });
};

AngularApp.prototype.runTests = function (appScriptsTree, addonsScriptsTree, vendorScriptsTree, lintingResults) {
    var tests,
        unitTestingResults;

    if (!this.isTesting) {
        return lintingResults;
    }

    tests = new Babel(this.appTestsTree(), {
        moduleIds  : true,
        sourceRoot : 'app'
    });

    unitTestingResults = unitTest(mergeTrees([vendorScriptsTree, addonsScriptsTree, appScriptsTree, tests, lintingResults]), {
        singleRun  : !this.isServing,
        autoWatch  : this.isServing,
        configFile : process.cwd() + '/karma.conf.js',
        files      : [ 'scripts/vendor.js', 'tests/angular-mocks.js', 'tests/helpers/**/*.js', '**/*.js' ],
    });

    return mergeTrees([lintingResults, unitTestingResults]);
};

AngularApp.prototype.toTree = function () {
    var html          = this.htmlTree(),
        vendorScripts = this.processVendorScripts(),
        vendorStyles  = this.processVendorStyles(),
        templates     = this.processAngularTemplates(this.templateTree()),
        appScripts    = mergeTrees([this.appScriptTree(), templates]),
        addonsScripts = this.addonsTree(),
        appStyles     = this.appStyleTree(),
        appAssets     = this.assetsTree(),
        lintingResults,
        testResults,
        assets;

    appStyles = less([appStyles], 'styles/app.less', 'styles/app.css', {
        paths: ['app/styles/', 'bower_components/']
    });

    lintingResults = this.runLinter(appScripts, appStyles);

    appScripts = new Babel(appScripts, {
        moduleIds           : true,
        modules             : 'amdStrict',
        resolveModuleSource : amdNameResolver,
        sourceRoot          : 'app'
    });
    addonsScripts = new Babel(addonsScripts, {
        moduleIds           : true,
        modules             : 'amdStrict',
        resolveModuleSource : amdNameResolver,
        sourceRoot          : 'app'
    });
    appScripts    = ngAnnotate(appScripts    , { add: true });
    addonsScripts = ngAnnotate(addonsScripts , { add: true });
    vendorScripts = ngAnnotate(vendorScripts , { add: true });

    testResults = this.runTests(appScripts, addonsScripts, vendorScripts, lintingResults);

    appScripts = concat(mergeTrees([appScripts, addonsScripts]), {
        inputFiles  : [ 'addons/**/*.js', 'app/**/*.js' ],
        footerFiles : [ 'scripts/templates.js' ],
        footer      : 'require("app/app");',
        outputFile  : 'scripts/app.js'
    });

    if (this.isServing) {
        html = liveReload(html);
    }

    // Minify / Obfuscate
    if (this.isProduction) {
        html = htmlMinify(html, {
            comments: false
        });

        appScripts    = uglifyJs(appScripts);
        vendorScripts = uglifyJs(vendorScripts);

        appStyles    = less(appStyles, 'styles/app.css', 'styles/app.css', { compress: true });
        vendorStyles = less(vendorStyles, 'styles/vendor.css', 'styles/vendor.css', { compress: true });

        appAssets = imagemin(appAssets, {
            interlaced        : true, // GIF
            progressive       : true, // JPG
            optimizationLevel : 3     // PNG
        });
    }

    assets = mergeTrees([html, appScripts, vendorScripts, appStyles, vendorStyles, appAssets]);

    if (this.isProduction) {
        assets = fingerprint(assets, {
            extensions: ['js', 'css'],
            replaceExtensions: ['html']
        });
    }

    return mergeTrees([testResults, assets], { overwrite: true });
};

AngularApp.prototype.aggregateVendorDependencies = function (files, outputPath) {
    var dependencies = [],
        depLength    = files.length,
        fileNames    = [],
        filePieces,
        fileName,
        filePath;

    for (var x = 0; x < depLength; x++) {
        filePieces = files[x].split('/');
        fileName   = filePieces[filePieces.length - 1];
        filePath   = files[x].substr(0, files[x].length - fileName.length);

        dependencies.push(new Funnel(filePath, {
            include: [fileName]
        }));

        fileNames.push(fileName);
    }

    if (fileNames.length === 0) {
        return writeFile(outputPath, '');
    }

    return concat(mergeTrees(dependencies), {
        outputFile  : outputPath,
        headerFiles : fileNames
    });
};

AngularApp.prototype.importScript = function (filePath) {
    this.vendorScripts.push(filePath);
};

AngularApp.prototype.importStyle = function (filePath) {
    this.vendorStyles.push(filePath);
};
