const Funnel        = require('broccoli-funnel'),
    concat          = require('broccoli-concat'),
    less            = require('broccoli-less-single'),
    mergeTrees      = require('broccoli-merge-trees'),
    ngTemplate      = require('@angular-bro/broccoli-angular-templates-cache'),
    htmlMinify      = require('broccoli-htmlmin'),
    liveReload      = require('broccoli-inject-livereload'),
    eslint          = require('broccoli-lint-eslint'),
    csslint         = require('broccoli-csslint'),
    uglifyJs        = require('broccoli-uglify-js'),
    Imagemin        = require('broccoli-imagemin'),
    imageminGif     = require('imagemin-gifsicle'),
    imageminJpeg    = require('imagemin-jpegtran'),
    imageminPng     = require('imagemin-pngquant'),
    fingerprint     = require('broccoli-asset-rev'),
    amdLoader       = require('broccoli-amd-loader'),
    Babel           = require('broccoli-babel-transpiler'),
    writeFile       = require('broccoli-file-creator'),
    stew            = require('broccoli-stew'),
    chalk           = require('chalk'),
    _               = require('lodash'),
    escape          = require('js-string-escape'),
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
    const env = process.env.ANGULAR_ENV || 'development';

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
    const config = {
            polyfill: false
        },
        uglifyConfig = {
            enabled: this.isProduction,
            mangle: true,
            compress: true,
            output: {}
        },
        cssConfig = {
            compress: this.isProduction
        },
        fingerprintConfig = {
            enabled: this.isProduction,
            extensions: [ 'js', 'css' ],
            replaceExtensions: [ 'html' ],
            prepend: '',
            customHash: undefined,
            exclude: [],
            ignore: []
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
    const file = `
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item) && item !== null);
}

function mergeDeep(target, source) {
  let output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = mergeDeep(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

const jsonConfig = JSON.parse('${this.appConfig}');
let config = jsonConfig;

if (jsonConfig.overrideConfig) {
    config = mergeDeep(jsonConfig, window.angularConfig || {});
}

export default config;
`;

    let config = writeFile('/config/environment.js', file);

    config = this.babel(config);

    return config;
};

AngularApp.prototype.angularTree = function () {
    const angular = new Funnel('bower_components/angular/', {
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
    return new Funnel('.', {
        include: ['index.html'],
        destDir: '/',
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
    const bowerConfig = require(process.cwd() + '/bower.json'),
        addons = [];
    let dependencies = {};

    dependencies = Object.assign(dependencies, bowerConfig.dependencies || {}, bowerConfig.devDependencies || {});

    for (const dep in dependencies) {
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
    const testScripts = new Funnel('tests', {
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
    let babelPath = require.resolve('core-js/stable');

    babelPath = babelPath.replace(/index\.js$/, '');

    return new Funnel(babelPath, {
        include: ['polyfill.js'],
        annotation: 'Funnel: Babel browser polyfill'
    });
};

AngularApp.prototype.processAngularTemplates = function (templates) {
    let templatesCache = ngTemplate([templates], {
        moduleName: 'templates-app',
        fileName: 'templates.js',
        srcDir: './',
        destDir: 'app/scripts',
        minify: {
            removeComments: true,
            collapseWhitespace: true,
            remoteTagWhitespace: true
        },
        annotation: 'Ng Templates: App Templates'
    });

    templatesCache = stew.map(templatesCache, function (content) {
        return `angular.module("templates-app", []);
            ${content}`;
    });

    return templatesCache;
};

AngularApp.prototype.processVendorScripts = function () {
    const angular = this.angularTree(),
        polyfill  = [];
    let vendorScripts = this.aggregateVendorDependencies(this.vendorScripts, 'scripts/vendor.js');

    if (this.options.polyfill === true) {
        polyfill.push(this.babelPolyfillTree());
    }

    vendorScripts = mergeTrees(polyfill.concat([angular, vendorScripts]), {
        sourceMapConfig: { enabled: !this.isProduction },
        annotation: 'Merge Trees: Angular and Vendor'
    });
    vendorScripts = amdLoader(vendorScripts, { destDir: 'scripts', annotation: 'AMD Loader: Inject loader'});
    vendorScripts = concat(vendorScripts, {
        outputFile: 'scripts/vendor.js',
        headerFiles: ['scripts/loader.js', 'angular.js', 'angular-shim.amd.js'],
        inputFiles: ['**/*.js'],
        footerFiles: ['scripts/vendor.js'],
        sourceMapConfig: { enabled: !this.isProduction },
        annotation: 'Concat: Loader, Angular, Shim, **, Vendor Files'
    });

    return vendorScripts;
};

AngularApp.prototype.processVendorStyles = function () {
    let vendorStyles = this.aggregateVendorDependencies(this.vendorStyles, 'styles/vendor.css');

    vendorStyles = concat(vendorStyles, {
        inputFiles: ['**/*.css'],
        outputFile: 'styles/vendor.css',
        sourceMapConfig: { enabled: !this.isProduction },
        annotation: 'Concat: Vendor CSS'
    });

    return vendorStyles;
};

AngularApp.prototype.runLinter = function (appScriptsTree, appStylesTree) {
    const lintScripts = eslint(appScriptsTree, {
            annotation: 'ESLint: Lint App Scripts',
            testGenerator: function (relativePath, errors, results) {
                const passed = !results.errorCount || results.errorCount.length === 0;
                let messages = `${relativePath} should pass ESLint`,
                    output = ``,
                    failure = ``;

                if (!passed && results.messages) {
                    messages += `\n\n${render(results.messages)}`;
                    failure = `fail("${escape(messages)}");`;
                }

                output += `
describe("ESLint | ${escape(relativePath)}", function () {
    it("should pass ESLint.", function () {
        ${failure};
        expect(true).toBe(true);
    });
});`;

                return output;
            }
        }),
        lintStyles = csslint(appStylesTree, {
            annotation: 'CSS Lint: Lint Styles'
        });

    return new Funnel(mergeTrees([lintScripts, lintStyles], { annotation: 'Merge Trees: Linting' }), {
        destDir: 'tests/lint',
        annotation: 'Funnel: Linting'
    });
};

AngularApp.prototype.runTests = function (appScriptsTree, addonsScriptsTree, vendorScriptsTree, lintingResults) {
    const tests = this.babel(this.appTestsTree(), {
        plugins: [],
        sourceMap: false,
    });

    const unitTestingResults = mergeTrees([vendorScriptsTree, addonsScriptsTree, appScriptsTree, tests, lintingResults], {
        annotation: 'Merge Trees: Vendor Scripts, Addon Scripts, App Scripts, tests, linting'
    });

    return mergeTrees([lintingResults, unitTestingResults], { overwrite: true, annotation: 'Merge Trees: Linting Results, Unit Tests' });
};

AngularApp.prototype.toTree = function () {
    const templates   = this.processAngularTemplates(this.templateTree());
    let html          = this.htmlTree(),
        vendorScripts = this.processVendorScripts(),
        vendorStyles  = this.processVendorStyles(),
        appScripts    = this.appScriptTree(),
        addonsScripts = this.addonsTree(),
        appStyles     = this.appStyleTree(),
        appAssets     = this.assetsTree(),
        lintingResults = null,
        assets;

    appStyles = less([appStyles], 'styles/app.less', 'styles/app.css', {
        paths: ['styles/', 'bower_components/'],
        annotation: 'Less: App Styles'
    });

    lintingResults = this.runLinter(appScripts, appStyles);

    appScripts    = this.babel(mergeTrees([appScripts, templates]));
    addonsScripts = this.babel(addonsScripts);

    if (this.isTesting === true) {
        return this.runTests(appScripts, addonsScripts, vendorScripts, lintingResults);
    }

    appScripts = concat(mergeTrees([appScripts, addonsScripts], { annotation: 'Merge Trees: App, Addons' }), {
        inputFiles: [ '**/*.js' ],
        footer: 'require("app/app");',
        outputFile: 'scripts/app.js',
        sourceMapConfig: { enabled: !this.isProduction },
        annotation: 'Concat: addons, app/*, templates'
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


        appAssets = new Imagemin(appAssets, {
            plugins: [
                imageminGif({ interlaced: true }),
                imageminJpeg({ progressive: true }),
                imageminPng({ optimizationLevel: 3 }),
            ],
            annotation: 'Image Min: assets images'
        });
    }

    if (this.uglifyOptions.enabled === true) {
        console.log('Uglify configuration');
        console.log(chalk.cyan(JSON.stringify(this.uglifyOptions, null, 2)));

        appScripts    = uglifyJs(appScripts, {
            mangle: this.uglifyOptions.mangle,
            compress: this.uglifyOptions.compress,
            output: this.uglifyOptions.output,
            annotation: 'Uglify JS: App'
        });
        vendorScripts = uglifyJs(vendorScripts, {
            mangle: this.uglifyOptions.mangle,
            compress: this.uglifyOptions.compress,
            output: this.uglifyOptions.output,
            annotation: 'Uglify JS: Vendor'
        });
    }

    if (this.cssOptions.compress === true) {
        appStyles    = less(appStyles, 'styles/app.css', 'styles/app.css', {
            compress: true,
            annotation: 'Less: Minify App CSS'
        });
        vendorStyles = less(vendorStyles, 'styles/vendor.css', 'styles/vendor.css', {
            compress: true,
            annotation: 'Less: Minify Vendor CSS'
        });
    }

    assets = mergeTrees([html, appScripts, vendorScripts, appStyles, vendorStyles, appAssets], {
        annotation: 'Merge Trees: HTML, App Scripts, Vendor Scripts, App Styles, Vendor Styles, Assets'
    });

    if (this.fingerprintOptions.enabled === true) {
        console.log('Fingerprinting Options');
        console.log(chalk.cyan(JSON.stringify(this.fingerprintOptions, null, 2)));

        assets = fingerprint(assets, {
            extensions: this.fingerprintOptions.extensions,
            replaceExtensions: this.fingerprintOptions.replaceExtensions,
            prepend: this.fingerprintOptions.prepend,
            customHash: this.fingerprintOptions.customHash,
            exclude: this.fingerprintOptions.exclude,
            ignore: this.fingerprintOptions.ignore,
            annotation: 'Fingerprint: All'
        });
    }

    return mergeTrees([lintingResults, assets], { annotation: 'Merge Trees: Test results, all' });
};

AngularApp.prototype.aggregateVendorDependencies = function (files, outputPath) {
    const dependencies = [],
        depLength    = files.length,
        fileNames    = [];
    let filePieces,
        fileName,
        filePath;

    for (let x = 0; x < depLength; x++) {
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
        outputFile: outputPath,
        headerFiles: fileNames,
        sourceMapConfig: { enabled: !this.isProduction },
        annotation: 'Concat: Vendor Dependencies'
    });
};

AngularApp.prototype.importScript = function (filePath) {
    this.vendorScripts.push(filePath);
};

AngularApp.prototype.importStyle = function (filePath) {
    this.vendorStyles.push(filePath);
};

/**
 * Uniformly creates a babel tree.
 * Extends the root .babelrc by adding the `transform-es2015-modules-amd` plugin.
 * Creates AMD modules, but can be overridden to only transpile using the settings.
 *
 * @param  {Broccoli.tree} tree    a broccoli tree
 * @param  {object}        options babel settings
 *
 * @return {Broccoli.tree}         the resulting tree
 */
AngularApp.prototype.babel = function (tree, options) {
    return new Babel(tree, Object.assign({
        moduleIds: true,
        extends: `${process.cwd()}/.babelrc`,
        plugins: [
            "angularjs-annotate",
            [
                "@babel/transform-modules-amd",
                {
                    getModuleId: function (name) {
                        return name.replace(`${process.cwd()}/`, '');
                    }
                }
            ],
        ],
        sourceMap: this.isProduction ? false : 'inline',
    }, options));
}

function render (errors) {
    return errors.map(
        error => `${error.line}:${error.column} - ${error.message} (${error.ruleId})`
    ).join('\n');
}
