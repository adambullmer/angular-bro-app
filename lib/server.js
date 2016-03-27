var fs                 = require('fs'),
    chalk              = require('chalk'),
    express            = require('express'),
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
fs.access(mockServerLocation, fs.F_OK, function (error) {
    if (error !== null) {
        return;
    }

    require(mockServerLocation)(app);
});

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
