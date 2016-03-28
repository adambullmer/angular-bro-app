var chalk = require('chalk');

module.exports = function (environment, verbose) {
    try {
        var config = require(process.cwd() + '/config/environment.js')(environment);

        if (verbose === true) {
            console.log('Generating the following configuration');
            console.log(chalk.cyan(JSON.stringify(config, null, 2)));
        }

        return JSON.stringify(config);
    } catch (exception) {
        console.warn(chalk.yellow('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
        console.warn(chalk.yellow('┃ ') + chalk.yellow('⚠  ') + chalk.red('WARNING!') + ' No ' + chalk.cyan('config/environment.js') + ' file is present.' + chalk.yellow(' ┃'));
        console.warn(chalk.yellow('┃ ') + 'This misconfigured state may cause the app misbehave.' + chalk.yellow(' ┃'));
        console.warn(chalk.yellow('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
        console.warn();
    }

    return '{}';
};
