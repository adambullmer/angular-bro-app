var fs                 = require('fs'),
    chalk              = require('chalk'),
    express            = require('express'),
    AngularApp         = require('./angular-app'),
    configLoader       = require('./config-loader'),
    BroccoliMiddleware = require('broccoli-livereload-middleware'),
    app                = express(),
    mockServerLocation = process.cwd() + '/server/index.js',
    serverDir          = process.cwd() + '/' + (process.env.ANGULAR_DEST_DIR || 'dist');

app.set('port', process.env.PORT || 9000);

if (process.env.ANGULAR_E2E !== 'true') {
    app.use(new BroccoliMiddleware({ destDir: serverDir }));
}

app.use(express.static(serverDir));

// Mock and proxy server
try {
    fs.accessSync(mockServerLocation, fs.F_OK);
    require(mockServerLocation)(app, configLoader(AngularApp.env()));
}
catch (exception) {
    console.log('No Mock or Proxy server configuration found: ' + chalk.cyan(mockServerLocation));
}

// Only enable if html5 routing is turned on
// Enable HTML5 routing by creating a catchall route
app.all('/*', function (req, res) {
    res.sendFile(serverDir + '/index.html');
});

// Start 'er up!
module.exports = app.listen(app.get('port'), function () {
    var port   = chalk.green(app.get('port')),
        cancel = chalk.red('Ctrl + C');

    console.log("Express server listening on port " + port + ' (Press ' + cancel + ' to stop)');
});
