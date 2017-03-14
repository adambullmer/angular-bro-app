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
    wrap            = require('broccoli-wrap'),
    chalk           = require('chalk'),
    _               = require('lodash'),
    configLoader    = require('./config-loader');

module.exports = AngularApp;

function AngularApp (options) {
    this.vendorScripts = [];
    this.vendorStyles  = [];
    this.env           = AngularApp.env();
    this.isTesting     = AngularApp.isTesting();
    this.isServing     = AngularApp.isServing();
    this.isProduction  = this.env === 'production';
    this.appConfig     = configLoader(this.env, true);
    this.initOptions(options);
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

AngularApp.prototype.initOptions = function (options) {
    var config = {
            polyfill : false
        },
        uglifyConfig = {
            enabled  : this.isProduction,
            mangle   : true,
            compress : true,
            output   : {}
        },
        cssConfig = {
            compress: this.isProduction
        },
        fingerprintConfig = {
            enabled           : this.isProduction,
            extensions        : [ 'js', 'css' ],
            replaceExtensions : [ 'html' ],
            prepend           : '',
            customHash        : undefined,
            exclude           : [],
            ignore            : []
        };

    options = options || {};

    options.uglifyJs   = options.uglifyJs || {};
    this.uglifyOptions = _.merge(uglifyConfig, options.uglifyJs || {});
    delete options.uglifyJs;

    options.css     = options.css || {};
    this.cssOptions = _.merge(cssConfig, options.css || {});
    delete options.css;

    options.fingerprint     = options.fingerprint || {};
    this.fingerprintOptions = _.merge(fingerprintConfig, options.fingerprint || {});
    delete options.fingerprint;

    this.options = _.merge(config, options);
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
        sourceRoot          : 'config',
        sourceMap           : this.isProduction ? false : 'inline'
    });

    return config;
};

AngularApp.prototype.angularTree = function () {
    var angular = new Funnel('bower_components/angular/', {
            include: ['angular.js'],
            annotation: 'Funnel: Angular.js'
        }),
        shim = new Funnel('bower_components/angular-shim/dist', {
            include: ['angular-shim.amd.js'],
            annotation: 'Funnel: angular-shim.js'
        });

    return mergeTrees([angular, shim, this.configTree()], {
        annotation: 'Merge Trees: angular tree'
    });
};

AngularApp.prototype.appScriptTree = function () {
    return new Funnel('app', {
        include: ['**/*.js'],
        destDir: 'app',
        annotation: 'Funnel: app/**/*.js'
    });
};

AngularApp.prototype.templateTree = function () {
    return new Funnel(mergeTrees(['app', this.addonsTree()], {annotation: 'Merge Trees: app and addons'}), {
        include: ['**/*.html'],
        exclude: ['index.html'],
        destDir: 'app',
        annotation: 'Funnel: templates'
    });
};

AngularApp.prototype.htmlTree = function () {
    return new Funnel('./index.html', {
        destDir: '/index.html',
        annotation: 'Funnel: index.html'
    });
};

AngularApp.prototype.appStyleTree = function () {
    return new Funnel(mergeTrees(['styles', 'app'], {annotation: 'Merge Trees: Styles in app and styles dirs'}), {
        include: ['**/*.less'],
        destDir: 'styles',
        annotation: 'Funnel: styles'
    });
};

AngularApp.prototype.assetsTree = function () {
    return new Funnel('assets', {
        destDir: 'assets',
        annotation: 'Funnel: assets'
    });
};

AngularApp.prototype.addonsTree = function () {
    var bowerConfig = require(process.cwd() + '/bower.json'),
        dependencies = {},
        addons      = [];

    dependencies = Object.assign(dependencies, bowerConfig.dependencies || {}, bowerConfig.devDependencies || {});

    for (var dep in dependencies) {
        if (!dependencies.hasOwnProperty(dep)) {
            continue;
        }

        if (dep.substr(0, 12) !== 'angular-bro-') {
            continue;
        }

        addons.push(new Funnel('bower_components/' + dep + '/app/', {
            exclude: ['app.js', 'router.js'],
            destDir: 'app/',
            annotation: 'Funnel: addon ' + dep
        }));
    }

    return mergeTrees(addons, {
        annotation: 'Merge Trees: addons'
    });
};

AngularApp.prototype.appTestsTree = function () {
    var testScripts = new Funnel('tests', {
            include: [ '**/*.spec.js', 'helpers/**/*.js' ],
            destDir: 'tests',
            annotation: 'Funnel: tests and helpers'
        }),
        testHelpers = new Funnel('bower_components/angular-mocks/', {
            include: [ 'angular-mocks.js' ],
            destDir: 'tests',
            annotation: 'Funnel: angular mocks'
        });

    return mergeTrees([testScripts, testHelpers], {
        annotation: 'Merge Trees: tests and helpers'
    });
};

AngularApp.prototype.babelPolyfillTree = function () {
    var babelPath = require.resolve('broccoli-babel-transpiler'),

    babelPath = babelPath.replace(/\/index.js$/, '') + '/node_modules/babel-core';

    return new Funnel(babelPath, {
        files: ['browser-polyfill.js'],
        annotation: 'Funnel: Babel browser polyfill'
    });
};

AngularApp.prototype.processAngularTemplates = function (templates) {
    var templatesCache = ngTemplate(templates, {
        moduleName : 'templates-app',
        fileName   : 'templates.js',
        srcDir     : './',
        destDir    : 'scripts',
        strip      : 'app/',
        minify     : {
            removeComments      : true,
            collapseWhitespace  : true,
            remoteTagWhitespace : true
        },
        annotation: 'Ng Templates: App Templates'
    });

    templatesCache = wrap(templatesCache, {
        wrapper: [
            'angular.module("templates-app", []);',
            ''
        ],
        annotation : 'Wrap: Templates'
    });

    return templatesCache;
};

AngularApp.prototype.processVendorScripts = function () {
    var angular       = this.angularTree(),
        vendorScripts = this.aggregateVendorDependencies(this.vendorScripts, 'scripts/vendor.js'),
        polyfill      = [];

    if (this.options.polyfill === true) {
        polyfill.push(this.babelPolyfillTree());
    }

    vendorScripts = mergeTrees(polyfill.concat([angular, vendorScripts]), {
        sourceMapConfig : { enabled: !this.isProduction },
        annotation      : 'Merge Trees: Angular and Vendor'
    });
    vendorScripts = amdLoader(vendorScripts, { destDir: 'scripts', annotation: 'AMD Loader: Inject loader'});
    vendorScripts = concat(vendorScripts, {
        outputFile      : 'scripts/vendor.js',
        headerFiles     : ['scripts/loader.js', 'angular.js', 'angular-shim.amd.js'],
        inputFiles      : ['**/*.js'],
        footerFiles     : ['scripts/vendor.js'],
        sourceMapConfig : { enabled: !this.isProduction },
        annotation      : 'Concat: Loader, Angular, Shim, **, Vendor Files'
    });

    return vendorScripts;
};

AngularApp.prototype.processVendorStyles = function () {
    var vendorStyles = this.aggregateVendorDependencies(this.vendorStyles, 'styles/vendor.css');

    vendorStyles = concat(vendorStyles, {
        inputFiles      : ['**/*.css'],
        outputFile      : 'styles/vendor.css',
        sourceMapConfig : { enabled: !this.isProduction },
        annotation      : 'Concat: Vendor CSS'
    });

    return vendorStyles;
};

AngularApp.prototype.runLinter = function (appScriptsTree, appStylesTree) {
    var appScripts   = new Funnel(appScriptsTree, {
            exclude: ['scripts/templates.*'],
            annotation: 'Funnel: App Scripts, exclude templates'
        }),
        lintScripts = jshint(appScripts, {
            annotation: 'JS Hint: Lint App Scripts',
            testGenerator: function (relativePath, errors) {
                return 'describe("' + relativePath + '", function () {\n' +
                    '    it("should pass jshint.", function () {\n' +
                    '        expect(' + errors + ').toBe(true);\n' +
                    '    });\n' +
                    '});\n';
            }
        }),
        styleScripts = jscs(appScripts, {
            annotation: 'JSCS: Style Check App Scripts',
            testGenerator: function (relativePath, errors) {
                return 'describe("' + relativePath + '", function () {\n' +
                    '    it("should pass jscs.", function () {\n' +
                    '        expect(' + !!errors + ').toBe(false);\n' +
                    '    });\n' +
                    '});\n';
            }
        }),
        lintStyles = csslint(appStylesTree, {
            annotation: 'CSS Lint: Lint Styles'
        });

    return new Funnel(mergeTrees([lintScripts, styleScripts, lintStyles], { annotation: 'Merge Trees: Linting' }), {
        destDir: 'tests/lint',
        annotation: 'Funnel: Linting'
    });
};

AngularApp.prototype.runTests = function (appScriptsTree, addonsScriptsTree, vendorScriptsTree, lintingResults) {
    var tests,
        unitTestingResults;

    tests = new Babel(this.appTestsTree(), {
        moduleIds  : true,
        sourceRoot : 'app'
    });

    unitTestingResults = unitTest(mergeTrees([vendorScriptsTree, addonsScriptsTree, appScriptsTree, tests, lintingResults], {
        annotation: 'Merge Trees: Vendor Scripts, Addon Scripts, App Scripts, tests, linting'
    }), {
        singleRun  : !this.isServing,
        autoWatch  : this.isServing,
        configFile : process.cwd() + '/karma.conf.js',
        files      : [ 'scripts/vendor.js', 'tests/angular-mocks.js', 'tests/helpers/**/*.js', '**/*.js' ],
        annotation : 'Unit Test: Karma'
    });

    return mergeTrees([lintingResults, unitTestingResults], { overwrite: true, annotation: 'Merge Trees: Linting Results, Unit Tests' });
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
        assets;

    appStyles = less([appStyles], 'styles/app.less', 'styles/app.css', {
        paths: ['styles/', 'bower_components/'],
        annotation: 'Less: App Styles'
    });

    lintingResults = this.runLinter(appScripts, appStyles);

    appScripts = new Babel(appScripts, {
        moduleIds           : true,
        modules             : 'amdStrict',
        resolveModuleSource : amdNameResolver,
        sourceRoot          : 'app',
        sourceMap           : this.isProduction ? false : 'inline'
    });
    addonsScripts = new Babel(addonsScripts, {
        moduleIds           : true,
        modules             : 'amdStrict',
        resolveModuleSource : amdNameResolver,
        sourceRoot          : 'app',
        sourceMap           : this.isProduction ? false : 'inline'
    });
    appScripts    = ngAnnotate(appScripts    , { add: true, annotation: 'Ng Annotate: App Scripts' });
    addonsScripts = ngAnnotate(addonsScripts , { add: true, annotation: 'Ng Annotate: Addons Scripts' });
    vendorScripts = ngAnnotate(vendorScripts , { add: true, annotation: 'Ng Annotate: Vendor Scripts' });

    if (this.isTesting === true) {
        return this.runTests(appScripts, addonsScripts, vendorScripts, lintingResults);
    }

    appScripts = concat(mergeTrees([appScripts, addonsScripts], { annotation: 'Merge Trees: App, Addons' }), {
        inputFiles      : [ '**/*.js' ],
        footer          : 'require("app/app");',
        outputFile      : 'scripts/app.js',
        sourceMapConfig : { enabled: !this.isProduction },
        annotation      : 'Concat: addons, app/*, templates'
    });

    if (this.isServing) {
        html = liveReload(html, { annotation: 'Live Reload: Inject'});
    }

    // Minify / Obfuscate
    if (this.isProduction) {
        html = htmlMinify(html, {
            comments: false,
            annotation: 'HTML Min: index.html'
        });


        appAssets = imagemin(appAssets, {
            interlaced        : true, // GIF
            progressive       : true, // JPG
            optimizationLevel : 3,    // PNG
            annotation        : 'Image Min: assets images'
        });
    }

    if (this.uglifyOptions.enabled === true) {
        console.log('Uglify configuration');
        console.log(chalk.cyan(JSON.stringify(this.uglifyOptions, null, 2)));

        appScripts    = uglifyJs(appScripts, {
            mangle     : this.uglifyOptions.mangle,
            compress   : this.uglifyOptions.compress,
            output     : this.uglifyOptions.output,
            annotation : 'Uglify JS: App'
        });
        vendorScripts = uglifyJs(vendorScripts, {
            mangle     : this.uglifyOptions.mangle,
            compress   : this.uglifyOptions.compress,
            output     : this.uglifyOptions.output,
            annotation : 'Uglify JS: Vendor'
        });
    }

    if (this.cssOptions.compress === true) {
        appStyles    = less(appStyles, 'styles/app.css', 'styles/app.css', {
            compress   : true,
            annotation : 'Less: Minify App CSS'
        });
        vendorStyles = less(vendorStyles, 'styles/vendor.css', 'styles/vendor.css', {
            compress   : true,
            annotation : 'Less: Minify Vendor CSS'
        });
    }

    assets = mergeTrees([html, appScripts, vendorScripts, appStyles, vendorStyles, appAssets], {
        annotation: 'Merge Trees: HTML, App Scripts, Vendor Scripts, App Styles, Vendor Styles, Assets'
    });

    if (this.fingerprintOptions.enabled === true) {
        console.log('Fingerprinting Options');
        console.log(chalk.cyan(JSON.stringify(this.fingerprintOptions, null, 2)));

        assets = fingerprint(assets, {
            extensions        : this.fingerprintOptions.extensions,
            replaceExtensions : this.fingerprintOptions.replaceExtensions,
            prepend           : this.fingerprintOptions.prepend,
            customHash        : this.fingerprintOptions.customHash,
            exclude           : this.fingerprintOptions.exclude,
            ignore            : this.fingerprintOptions.ignore,
            annotation        : 'Fingerprint: All'
        });
    }

    return mergeTrees([lintingResults, assets], { annotation: 'Merge Trees: Test results, all' });
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

    return concat(mergeTrees(dependencies, {annotation: 'Merge Trees: Vendor Dependencies'}), {
        outputFile      : outputPath,
        headerFiles     : fileNames,
        sourceMapConfig : { enabled: !this.isProduction },
        annotation      : 'Concat: Vendor Dependencies'
    });
};

AngularApp.prototype.importScript = function (filePath) {
    this.vendorScripts.push(filePath);
};

AngularApp.prototype.importStyle = function (filePath) {
    this.vendorStyles.push(filePath);
};
